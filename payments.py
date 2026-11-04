"""Stripe test Checkout and an idempotent purchase ledger.

Credits are issued only after a signed, paid Checkout event. The return page
never grants credits. Cash-out activation is separate from accepting payments.
"""
import hashlib
import json
import os
import re
import uuid
from datetime import datetime, timezone
from flask import jsonify, request, session


def register_payments(app, db):
    def config():
        return app.extensions['platform_read']('stripe', {})

    def stripe_client():
        import stripe
        conf=config()
        secret=conf.get('secret_key','')
        if not secret.startswith('sk_test_'):
            raise ValueError('An administrator must connect Stripe test mode first.')
        return stripe, conf, secret

    @app.get('/api/payments/config')
    def payment_config():
        conf=config(); enabled=bool(conf.get('secret_key') and conf.get('webhook_secret') and conf.get('currency'))
        unit=conf.get('unit_minor',100); currency=conf.get('currency','usd')
        return jsonify(enabled=enabled, test_mode=True, payouts_enabled=False,
                       packs=[dict(credits=n,label=f'{n*unit/100:.2f} {currency.upper()}') for n in [250,750,1500]],
                       unit_label=f'{unit/100:.2f} {currency.upper()}')

    @app.post('/api/payments/checkout')
    def stripe_checkout():
        data=request.get_json(silent=True) or {};amount=data.get('credits');key=data.get('idempotency_key','')
        if type(amount) is not int or amount not in [250,750,1500] or not isinstance(key,str) or not re.fullmatch(r'[A-Za-z0-9-]{8,100}',key):
            return jsonify(error='Choose a listed credit pack.'),400
        try:
            stripe,conf,secret=stripe_client()
        except ValueError as exc:
            return jsonify(error=str(exc)),503
        if not conf.get('webhook_secret'):
            return jsonify(error='Configure the Stripe webhook before accepting purchases.'),503
        viewer=session['viewer'];ref=hashlib.sha256((viewer+':'+key).encode()).hexdigest()
        unit=conf['unit_minor'];currency=conf['currency']
        with db():
            db().execute('BEGIN IMMEDIATE')
            row=db().execute('SELECT * FROM stripe_orders WHERE id=?',(ref,)).fetchone()
            if row and (row['viewer']!=viewer or row['credits']!=amount):
                return jsonify(error='This checkout key belongs to another purchase.'),409
            if not row:
                db().execute('INSERT INTO stripe_orders VALUES (?,?,?,?,?,?,?,?)',(ref,viewer,amount,amount*unit,currency,'','pending',datetime.now(timezone.utc).isoformat()))
        origin=app.config.get('PUBLIC_APP_URL','').rstrip('/')
        if not origin.startswith('https://'):
            return jsonify(error='The administrator must configure the HTTPS app URL.'),503
        try:
            result=stripe.checkout.Session.create(
                api_key=secret,
                idempotency_key='checkout-'+ref,mode='payment',
                line_items=[dict(price_data=dict(currency=currency,unit_amount=unit,product_data=dict(name='Poll Pilled publishing credit')),quantity=amount)],
                client_reference_id=ref,metadata=dict(order_id=ref),success_url=origin+'/#wallet',cancel_url=origin+'/#wallet')
        except stripe.StripeError:
            return jsonify(error='Stripe could not confirm checkout. Retry the same purchase.'),502
        with db():
            db().execute('UPDATE stripe_orders SET stripe_session=? WHERE id=?',(result.id,ref))
        return jsonify(url=result.url)

    @app.post('/api/payments/webhook')
    def stripe_webhook():
        import stripe
        conf=config(); secret=conf.get('webhook_secret','')
        if not secret:
            return jsonify(error='Webhook not configured.'),503
        try:
            event=stripe.Webhook.construct_event(request.get_data(),request.headers.get('Stripe-Signature',''),secret,tolerance=300)
        except (ValueError,stripe.SignatureVerificationError):
            return jsonify(error='Invalid webhook signature.'),400
        if event.get('livemode') is not False:
            return jsonify(error='This endpoint accepts test-mode events only.'),400
        if event['type'] not in ['checkout.session.completed','checkout.session.async_payment_succeeded']:
            return jsonify(received=True)
        obj=event['data']['object']
        if obj.get('payment_status')!='paid':
            return jsonify(received=True)
        ref=obj.get('metadata',{}).get('order_id','')
        with db():
            db().execute('BEGIN IMMEDIATE')
            order=db().execute('SELECT * FROM stripe_orders WHERE id=?',(ref,)).fetchone()
            if not order:
                return jsonify(error='Unknown purchase.'),400
            if obj.get('amount_total')!=order['amount'] or obj.get('currency')!=order['currency'] or obj.get('client_reference_id')!=ref or obj.get('mode')!='payment':
                return jsonify(error='Purchase details do not match.'),400
            if order['stripe_session'] and order['stripe_session']!=obj['id']:
                return jsonify(error='Checkout session does not match.'),400
            if order['status']!='paid':
                db().execute('INSERT INTO pp_ledger VALUES (?,?,?,?,?,?,?,?)',(uuid.uuid4().hex,order['viewer'],'credits',order['credits'],'Stripe test credit purchase','stripe-'+ref,None,datetime.now(timezone.utc).isoformat()))
                db().execute("UPDATE stripe_orders SET status='paid',stripe_session=? WHERE id=?",(obj['id'],ref))
        return jsonify(received=True)

    @app.post('/api/payments/redeem')
    def stripe_redeem():
        return jsonify(error='Cash-outs require a configured Stripe Connect account and supported payout countries. No points were deducted.'),503

    def initialize():
        db().execute('CREATE TABLE IF NOT EXISTS stripe_orders(id TEXT PRIMARY KEY,viewer TEXT NOT NULL,credits INTEGER NOT NULL,amount INTEGER NOT NULL,currency TEXT NOT NULL,stripe_session TEXT NOT NULL,status TEXT NOT NULL,created_at TEXT NOT NULL)')
        db().commit()
    return dict(initialize=initialize)
