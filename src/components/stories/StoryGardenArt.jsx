import { useEffect, useRef } from 'react'

export function paintStoryGarden(canvas) {
        const box=canvas.parentElement.getBoundingClientRect();
        if(!box.width || !box.height)return;
        const ratio=Math.min(window.devicePixelRatio||1,2);
        canvas.width=Math.round(box.width*ratio);canvas.height=Math.round(box.height*ratio);
        const c=canvas.getContext('2d');if(!c)return;
        c.scale(canvas.width/600,canvas.height/452);
        let seed=38;
        const rnd=()=>{seed=(seed*16807)%2147483647;return(seed-1)/2147483646;};
        const ellipse=(x,y,rx,ry,col,rot=0)=>{c.beginPath();c.ellipse(x,y,rx,ry,rot,0,Math.PI*2);c.fillStyle=col;c.fill();};
        const line=(points,col,width)=>{c.beginPath();c.moveTo(points[0][0],points[0][1]);points.slice(1).forEach(p=>c.lineTo(p[0],p[1]));c.strokeStyle=col;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.stroke();};
        c.fillStyle='#F4F5E9';c.fillRect(0,0,600,452);
        ellipse(292,365,342,136,'#E5EACE');
        ellipse(0,242,105,172,'#EBEEDA');
        ellipse(605,135,91,164,'#EBEEDA');
        c.beginPath();c.moveTo(277,460);c.bezierCurveTo(405,345,199,325,307,198);c.bezierCurveTo(362,133,319,96,321,48);c.strokeStyle='#E3DECA';c.lineWidth=49;c.lineCap='round';c.stroke();
        c.strokeStyle='#F1EBDC';c.lineWidth=37;c.stroke();
        for(let i=0;i<125;i++){const x=rnd()*600,y=rnd()*452;ellipse(x,y,1+rnd()*2,.6+rnd(),'#CFD6B750');}
        const tree=(x,y,scale)=>{
          c.save();c.translate(x,y);c.scale(scale,scale);
          line([[0,141],[-3,52],[-27,16]],'#9B9E75',7);
          line([[0,104],[30,62],[44,8]],'#9B9E75',4);
          ellipse(-17,29,49,39,'#B5C198',-.25);ellipse(26,27,47,33,'#C7CEAA',.25);ellipse(-2,2,42,34,'#C4CEA7');ellipse(46,40,28,25,'#D3D9B7');
          for(let i=0;i<34;i++)ellipse(-53+rnd()*115,-24+rnd()*82,4+rnd()*7,2+rnd()*4,i%2?'#A4B08044':'#E2E8CC66',rnd());
          c.restore();
        };
        tree(41,28,1.1);tree(570,37,.85);
        const plant=(x,y,s,col)=>{
          line([[x,y],[x+2,y-35*s]],'#8D9A6C',1.5);
          ellipse(x-8*s,y-17*s,11*s,4*s,col,.55);
          ellipse(x+11*s,y-24*s,12*s,5*s,col,-.55);
          ellipse(x+1*s,y-39*s,5*s,10*s,col,.2);
        };
        [[29,436,1.2],[51,452,.7],[531,438,1],[561,420,1.5],[585,394,.8],[6,312,.9],[563,244,.7],[210,69,.7]].forEach((p,i)=>plant(p[0],p[1],p[2],i%2?'#AAB98C':'#C2CD9F'));
        ellipse(313,322,31,9,'#BCC6A04D');
        line([[287,302],[338,302]],'#A6936E',8);
        line([[288,294],[338,294]],'#BAA780',5);
        line([[295,305],[293,320]],'#8C7D5B',4);
        line([[332,305],[334,320]],'#8C7D5B',4);
        ellipse(483,412,41,12,'#C8D6C2',-.2);
        ellipse(484,411,30,7,'#DAE3D3',-.2);
        line([[465,413],[485,409]],'#AFBFAB',1);
        for(let i=0;i<8;i++){const x=220+rnd()*144,y=380+rnd()*67;ellipse(x,y,7+rnd()*6,3+rnd()*2,'#D6D8C0',rnd()*.3);}
        const flower=(x,y,col)=>{
          line([[x,y+12],[x,y]],'#A9B68A',1);
          for(let i=0;i<5;i++){const a=i*Math.PI*2/5;ellipse(x+Math.cos(a)*4,y+Math.sin(a)*4,3.7,3.1,col,a);}
          ellipse(x,y,2,2,'#B6A15D');
        };
        [[38,200],[551,308],[77,415],[443,43],[207,389],[557,166]].forEach((p,i)=>flower(p[0],p[1],i%2?'#E8DAB4':'#FDFBF2'));
      }

export default function StoryGardenArt() {
  const ref = useRef(null)
  useEffect(() => {
    const canvas = ref.current
    const draw = () => paintStoryGarden(canvas)
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
    observer?.observe(canvas.parentElement)
    draw()
    return () => observer?.disconnect()
  }, [])
  return <canvas ref={ref} aria-hidden="true" />
}
