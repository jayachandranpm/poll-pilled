export const formats = {
  image: ['Image comparison', 'gallery-linear'],
  classic: ['Classic poll', 'checklist-minimalistic-linear'],
  audio: ['Audio poll', 'headphones-round-linear'],
  slider: ['Opinion scale', 'tuning-2-linear'],
  ranking: ['Ranking', 'list-linear'],
  ab: ['A/B testing', 'widget-2-linear'],
  video: ['Video poll', 'videocamera-record-linear'],
};
export const polls = [
  {id:'everyday-bag',ai:true,type:'image',topic:'Design',title:'Which everyday bag should we make next?',name:'Quiet Orbit',tagline:'Curious about the everyday.',seconds:20,reward:300,thumb:'/assets/deck/canvas-tote.png',options:['Canvas tote','Daily bag'],images:['/assets/deck/canvas-tote.png','/assets/deck/daily-bag.png'],percent:[64,36],sample:248},
  {id:'workday',type:'classic',topic:'Work',title:'What makes a good workday?',name:'Cedar Finch',tagline:'Making room for better work.',seconds:15,reward:200,thumb:'/assets/deck/workday.png',options:['Time to focus','A flexible schedule','A team that listens','Finishing something meaningful'],percent:[38,28,22,12],sample:186},
  {id:'soundtrack',type:'audio',topic:'Lifestyle',title:'Pick your perfect soundtrack',name:'Soft Signal',tagline:'Finding the right frequency.',seconds:40,reward:400,thumb:'/assets/deck/headphones.png',options:['A quiet morning','An afternoon of focus','A slow evening'],percent:[27,48,25],sample:132},
  {id:'small-spaces',type:'slider',topic:'Design',title:'How much does natural light matter to you?',name:'River Stone',tagline:'A little more room to breathe.',seconds:15,reward:150,thumb:'/assets/sunroom.png',options:['1–3 · A little','4–7 · Quite a bit','8–10 · A lot'],percent:[9,24,67],sample:310},
  {id:'weekend',type:'ranking',topic:'Lifestyle',title:'Build your ideal slow weekend.',name:'Sunny Otter',tagline:'Small plans. Good days.',seconds:30,reward:350,options:['Time outdoors','A good meal','A creative project','Doing absolutely nothing'],percent:[36,29,20,15],sample:204},
  {id:'reading-corner',ai:true,type:'ab',topic:'Design',title:'Which corner would you settle into?',name:'River Stone',tagline:'A little more room to breathe.',seconds:20,reward:300,thumb:'/assets/reading-nook.png',options:['The reading nook','The sunroom'],images:['/assets/reading-nook.png','/assets/sunroom.png'],percent:[55,45],sample:126},
  {id:'first-impression',type:'video',topic:'Design',title:'Does this introduction make you want to know more?',name:'Quiet Orbit',tagline:'Curious about the everyday.',seconds:35,reward:400,options:['Yes, I would keep watching','Maybe, with a clearer opening','Not for me'],percent:[54,31,15],sample:92},
];
export const editorDefaults = () => ({title:'Which everyday bag should we make next?',type:'image',options:['Canvas tote','Daily bag'],images:['/assets/deck/canvas-tote.png','/assets/deck/daily-bag.png'],topic:'Design',count:100,seconds:20,ai:false});
