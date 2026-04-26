"use client";

import { forwardRef, useCallback, useEffect, useRef, useState } from "react";

type Product = {
  productName: string; price: string; category: string; mainBenefit: string;
  hook: string; features: string[]; targetAudience: string; cta: string;
  colorTheme: string; emoji: string;
  scripts: { modern: string; clean: string; bold: string; gradient: string; premium: string };
};
type ImageItem = { base64: string; mediaType: string; preview: string };
type ResultItem = { id: string; images: ImageItem[]; product: Product | null; error: string | null; loading: boolean };

const THEMES: Record<string, { bg: string; accent: string; panel: string; text: string }> = {
  warm:    { bg: "#0d0800", accent: "#f59e0b", panel: "#1a1000", text: "#fef3c7" },
  cool:    { bg: "#050a14", accent: "#60a5fa", panel: "#0a1428", text: "#e0f2fe" },
  natural: { bg: "#050d03", accent: "#4ade80", panel: "#0a1a07", text: "#dcfce7" },
  vibrant: { bg: "#0d050d", accent: "#e879f9", panel: "#1a0a1a", text: "#fdf4ff" },
  minimal: { bg: "#0a0a0a", accent: "#ffffff", panel: "#141414", text: "#ffffff" },
};
const THEME_META = [
  { key: "warm",    label: "따뜻한", color: "#f59e0b" },
  { key: "cool",    label: "차가운", color: "#60a5fa" },
  { key: "natural", label: "자연",   color: "#4ade80" },
  { key: "vibrant", label: "비비드", color: "#e879f9" },
  { key: "minimal", label: "미니멀", color: "#e5e5e5" },
];
const CONCEPT_META = [
  { label: "모던",    key: "modern"   },
  { label: "클린",    key: "clean"    },
  { label: "볼드",    key: "bold"     },
  { label: "그라데이션", key: "gradient" },
  { label: "프리미엄", key: "premium"  },
];
const eo = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 2);
type VideoPhase = "idle" | "recording" | "done";
type TransitionType = "crossfade" | "slide-up" | "slide-left" | "fade-black" | "zoom-fade";

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lh: number): number {
  const words = text.split(" ");
  let line = "", cy = y;
  for (const word of words) {
    const test = line ? line + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && line.length > 0) {
      ctx.fillText(line, x, cy); line = word; cy += lh;
    } else { line = test; }
  }
  if (line) ctx.fillText(line, x, cy);
  return cy;
}

type T = typeof THEMES.minimal;
type Cover = (cx: number, cy: number, cw: number, ch: number, dx: number, dy: number, dw: number, dh: number) => void;
type Contain = (dx: number, dy: number, dw: number, dh: number, bg?: string) => void;
type ContainR = (dx: number, dy: number, dw: number, dh: number, r: number, bg?: string) => void;
type CoverR = (dx: number, dy: number, dw: number, dh: number, r: number) => void;

// ── 모션 헬퍼 ──
type MotionType = "slide-up"|"fade"|"drop"|"slide-left"|"zoom";
function makeAn(ctx: CanvasRenderingContext2D, W: number, H: number, aT: number, mT: MotionType) {
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  return (d:number,fn:()=>void)=>{
    const a=e(d);
    if(mT==="zoom"){
      const sc=0.88+a*0.12;
      ctx.save();ctx.globalAlpha=a;ctx.translate(W/2,H/2);ctx.scale(sc,sc);ctx.translate(-W/2,-H/2);fn();ctx.restore();
    }else{
      const tx=mT==="slide-left"?(1-a)*80:0;
      const ty=mT==="drop"?-(1-a)*50:mT==="fade"?0:(1-a)*50;
      ctx.save();ctx.globalAlpha=a;ctx.translate(tx,ty);fn();ctx.restore();
    }
  };
}

// ── 컨셉 0: 모던 ──
function c0(ctx:CanvasRenderingContext2D,W:number,H:number,t:T,cv:Cover,cn:Contain,p:Product,i:number,aT:number,mT:MotionType){
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  const an=makeAn(ctx,W,H,aT,mT);
  if(i===0){
    an(0,()=>cv(0,0,W,H,0,0,W,H));
    const g=ctx.createLinearGradient(0,H*.38,0,H);g.addColorStop(0,"rgba(0,0,0,0)");g.addColorStop(1,"rgba(0,0,0,.92)");ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
    an(0.06,()=>{ctx.fillStyle=t.accent;ctx.font="bold 34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.emoji+" "+p.category,64,H-300);});
    an(0.13,()=>{ctx.fillStyle="#fff";ctx.font="bold 88px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.hook,64,H-220,W-200,108);});
    ctx.fillStyle=t.accent;ctx.fillRect(64,H-72,120*e(0.21),8);
  }else if(i===1){
    const pH=Math.round(H*.52);
    an(0,()=>cn(0,0,W,pH,t.bg));
    const fd=ctx.createLinearGradient(0,pH-80,0,pH);fd.addColorStop(0,"rgba(0,0,0,0)");fd.addColorStop(1,t.panel);ctx.fillStyle=fd;ctx.fillRect(0,pH-80,W,80);ctx.fillStyle=t.panel;ctx.fillRect(0,pH,W,H-pH);
    an(0.07,()=>{ctx.fillStyle=t.accent;ctx.fillRect(64,pH+60,8,H-pH-120);ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 01",88,pH+120);});
    an(0.14,()=>{ctx.fillStyle=t.text;ctx.font="bold 68px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[0]??"",88,pH+224,W-200,84);});
    an(0.22,()=>{ctx.fillStyle=t.accent+"aa";ctx.font="34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,88,H-80);});
  }else if(i===2){
    an(0,()=>cv(0,0,W,H,0,0,W,H));ctx.fillStyle="rgba(0,0,0,.65)";ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.08*e(0.04);ctx.fillStyle=t.accent;ctx.font="bold 420px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("02",-20,H*.72);ctx.restore();
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.fillRect(64,H*.28,8,H*.38);ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 02",88,H*.30);});
    an(0.15,()=>{ctx.fillStyle="#fff";ctx.font="bold 72px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[1]??"",88,H*.36,W-200,90);});
    an(0.22,()=>{ctx.fillStyle=t.accent+"cc";ctx.font="34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,88,H*.72);});
  }else if(i===3){
    ctx.fillStyle=t.panel;ctx.fillRect(0,0,W,H);
    const sx=Math.round(W*.5);
    const imgEl=(ctx.canvas as any).__img as HTMLImageElement;
    if(imgEl){const s2=Math.min((W-sx)/imgEl.width,H/imgEl.height)*.88;const iw2=imgEl.width*s2,ih2=imgEl.height*s2;ctx.save();ctx.globalAlpha=e(0.02);ctx.drawImage(imgEl,sx+(W-sx-iw2)/2,(H-ih2)/2,iw2,ih2);ctx.restore();}
    const fx=ctx.createLinearGradient(sx-80,0,sx+60,0);fx.addColorStop(0,t.panel);fx.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=fx;ctx.fillRect(0,0,W,H);
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.fillRect(64,H*.26,8,H*.48);ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 03",88,H*.28);});
    an(0.15,()=>{ctx.fillStyle=t.text;ctx.font="bold 64px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[2]??"",88,H*.34,sx-120,80);});
    an(0.22,()=>{ctx.fillStyle=t.accent+"aa";ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,88,H*.78);});
  }else{
    const sy=Math.round(H*.44);ctx.fillStyle=t.bg;ctx.fillRect(0,0,W,H);
    an(0.01,()=>cv(0,sy,W,H-sy,0,sy,W,H-sy));
    const g5=ctx.createLinearGradient(0,sy-20,0,sy+160);g5.addColorStop(0,t.bg);g5.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=t.bg;ctx.fillRect(0,0,W,sy);ctx.fillStyle=g5;ctx.fillRect(0,sy-20,W,180);
    an(0.06,()=>{ctx.font="88px serif";ctx.fillText(p.emoji,64,108);});
    an(0.12,()=>{ctx.fillStyle=t.accent;ctx.font="bold 44px 'Apple SD Gothic Neo',sans-serif";const ny=wrapText(ctx,p.productName,64,196,W-200,56);ctx.fillRect(64,ny+24,60,5);ctx.fillStyle=t.text;ctx.font="bold 56px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.mainBenefit,64,ny+56,W-200,70);});
    if(p.price){an(0.20,()=>{ctx.fillStyle=t.accent;ctx.font="bold 50px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.price,64,sy-130);});}
    const by=p.price?sy-80:sy-100;
    an(0.26,()=>{ctx.fillStyle=t.accent;ctx.beginPath();ctx.roundRect(64,by,W-200,76,38);ctx.fill();ctx.fillStyle="#000";ctx.font="bold 36px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.cta,W/2,by+50);ctx.textAlign="left";});
  }
}

// ── 컨셉 1: 클린 ──
function c1(ctx:CanvasRenderingContext2D,W:number,H:number,t:T,cv:Cover,_cn:Contain,cvR:CoverR,p:Product,i:number,aT:number,mT:MotionType){
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  const an=makeAn(ctx,W,H,aT,mT);
  const bg="#fafaf8",tc="#1a1a1a",mc="#888";
  if(i===0){
    an(0,()=>cv(0,0,W,H,0,0,W,H));
    const wg=ctx.createLinearGradient(0,H*.36,0,H);wg.addColorStop(0,"rgba(255,255,255,0)");wg.addColorStop(.35,"rgba(255,255,255,.95)");wg.addColorStop(1,"rgba(255,255,255,1)");ctx.fillStyle=wg;ctx.fillRect(0,0,W,H);
    an(0.07,()=>{ctx.fillStyle=t.accent;ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.emoji+" "+p.category,80,H*.57);});
    an(0.14,()=>{ctx.fillStyle=tc;ctx.font="bold 80px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.hook,80,H*.63,W-200,100);});
    ctx.fillStyle=t.accent;ctx.fillRect(80,H-100,100*e(0.22),6);
  }else if(i===1){
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);const sx=Math.round(W*.48);
    an(0,()=>cvR(0,0,sx,H,0));
    const gR=ctx.createLinearGradient(sx-120,0,sx,0);gR.addColorStop(0,"rgba(0,0,0,0)");gR.addColorStop(1,bg);ctx.fillStyle=gR;ctx.fillRect(sx-120,0,120,H);
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 01",sx+40,H*.20);ctx.fillRect(sx+40,H*.23,W-sx-80,3);});
    an(0.15,()=>{ctx.fillStyle=tc;ctx.font="bold 64px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[0]??"",sx+40,H*.28,W-sx-100,80);});
    an(0.23,()=>{ctx.fillStyle=mc;ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,sx+40,H*.76);});
  }else if(i===2){
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.1*e(0.03);ctx.fillStyle=t.accent;ctx.font="bold 380px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("02",20,H*.72);ctx.restore();
    an(0,()=>cvR(Math.round(W*.5),0,Math.round(W*.5),H,0));
    const gL=ctx.createLinearGradient(Math.round(W*.5),0,Math.round(W*.5)+120,0);gL.addColorStop(0,bg);gL.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gL;ctx.fillRect(Math.round(W*.5),0,120,H);
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 02",80,H*.35);ctx.fillRect(80,H*.38,60*e(0.10),3);});
    an(0.15,()=>{ctx.fillStyle=tc;ctx.font="bold 64px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[1]??"",80,H*.43,W*.42,80);});
    an(0.23,()=>{ctx.fillStyle=mc;ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,80,H*.72);});
  }else if(i===3){
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
    an(0,()=>cvR(100,100,W-200,Math.round(H*.5),28));
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText("특징 03",W/2,H*.65);ctx.fillRect(W/2-50*e(0.10),H*.68,100*e(0.10),3);ctx.textAlign="left";});
    an(0.15,()=>{ctx.fillStyle=tc;ctx.font="bold 64px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[2]??"",80,H*.72,W-200,80);});
    an(0.23,()=>{ctx.fillStyle=mc;ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText("▸ "+p.targetAudience,W/2,H*.9);ctx.textAlign="left";});
  }else{
    ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);ctx.fillStyle=t.accent;ctx.fillRect(0,0,W,Math.round(H*.055));
    an(0.04,()=>{ctx.font="80px serif";ctx.fillText(p.emoji,80,170);});
    an(0.10,()=>{ctx.fillStyle=tc;ctx.font="bold 48px 'Apple SD Gothic Neo',sans-serif";const ny=wrapText(ctx,p.productName,80,260,W-200,60);ctx.fillStyle=t.accent;ctx.fillRect(80,ny+24,60,3);ctx.fillStyle=tc;ctx.font="bold 54px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.mainBenefit,80,ny+54,W-200,68);});
    if(p.price){an(0.18,()=>{ctx.fillStyle=t.accent;ctx.font="bold 52px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.price,80,H*.42);});}
    an(0.06,()=>cvR(80,Math.round(H*.46),W-200,Math.round(H*.38),24));
    an(0.24,()=>{ctx.fillStyle=t.accent;ctx.beginPath();ctx.roundRect(80,Math.round(H*.87),W-200,80,40);ctx.fill();ctx.fillStyle="#fff";ctx.font="bold 36px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.cta,W/2,Math.round(H*.87)+52);ctx.textAlign="left";});
  }
}

// ── 컨셉 2: 볼드 ──
function c2(ctx:CanvasRenderingContext2D,W:number,H:number,t:T,cv:Cover,_cn:Contain,cvR:CoverR,p:Product,i:number,aT:number,mT:MotionType){
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  const an=makeAn(ctx,W,H,aT,mT);
  if(i===0){
    an(0,()=>cv(0,0,W,H,0,0,W,H));ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect(0,0,W,H);
    ctx.fillStyle=t.accent;ctx.fillRect(0,0,W*e(0.02),18);
    an(0.08,()=>{ctx.fillStyle="#fff";ctx.font="bold 88px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.hook,64,200,W-200,108);});
    an(0.18,()=>{ctx.fillStyle=t.accent;ctx.font="bold 36px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.emoji+" "+p.category,64,H-80);});
  }else if(i===1){
    ctx.fillStyle=t.panel;ctx.fillRect(0,0,W,H);
    ctx.save();ctx.globalAlpha=.09*e(0.03);ctx.fillStyle=t.accent;ctx.font="bold 480px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("01",-40,H*.65);ctx.restore();
    an(0.06,()=>{ctx.fillStyle=t.accent;ctx.fillRect(64,H*.14,8,H*.5);ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("FEATURE 01",88,H*.17);});
    an(0.13,()=>{ctx.fillStyle=t.text;ctx.font="bold 80px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[0]??"",88,H*.24,W*.46,98);});
    an(0.03,()=>cv(W*.5,0,W*.5,H*.68,W*.5,0,W*.5,H*.68));
    const gf1=ctx.createLinearGradient(W*.5,0,W*.66,0);gf1.addColorStop(0,t.panel);gf1.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gf1;ctx.fillRect(W*.5,0,W*.16,H*.68);
    an(0.22,()=>{ctx.fillStyle=t.accent+"aa";ctx.font="34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,88,H*.78);});
  }else if(i===2){
    const half=Math.round(H*.5);ctx.fillStyle=t.accent;ctx.fillRect(0,0,W,half);
    an(0,()=>cv(0,half,W,H-half,0,half,W,H-half));
    const gBot=ctx.createLinearGradient(0,half,0,half+100);gBot.addColorStop(0,"rgba(0,0,0,.6)");gBot.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gBot;ctx.fillRect(0,half,W,100);
    ctx.save();ctx.globalAlpha=.12*e(0.04);ctx.fillStyle="#000";ctx.font="bold 480px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("02",-30,half+100);ctx.restore();
    an(0.06,()=>{ctx.fillStyle="#000";ctx.font="bold 32px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("FEATURE 02",64,80);});
    an(0.12,()=>{ctx.font="bold 88px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[1]??"",64,160,W-200,108);});
    an(0.20,()=>{ctx.fillStyle=t.text;ctx.font="34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,64,half+360);});
  }else if(i===3){
    an(0,()=>cv(0,0,W,H,0,0,W,H));ctx.fillStyle="rgba(0,0,0,.72)";ctx.fillRect(0,0,W,H);
    ctx.fillStyle=t.accent;ctx.fillRect(64,H*.26,(W-200)*e(0.06),12);
    an(0.06,()=>{ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("FEATURE 03",64,H*.24);});
    an(0.12,()=>{ctx.fillStyle="#fff";ctx.font="bold 88px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[2]??"",64,H*.34,W-200,108);});
    ctx.fillStyle=t.accent;ctx.fillRect(64,H*.66,(W-200)*e(0.20),12);
    an(0.22,()=>{ctx.font="34px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,64,H*.72);});
  }else{
    ctx.fillStyle=t.bg;ctx.fillRect(0,0,W,H);
    an(0.04,()=>{ctx.fillStyle=t.accent;ctx.font="bold 56px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.productName,64,100,W-200,70);});
    an(0.11,()=>{ctx.fillStyle=t.text;ctx.font="bold 84px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.mainBenefit,64,230,W-200,104);});
    if(p.price){an(0.17,()=>{ctx.fillStyle=t.accent;ctx.font="bold 72px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.price,64,H*.36);});}
    an(0.21,()=>{ctx.fillStyle=t.accent;ctx.beginPath();ctx.roundRect(64,Math.round(H*.44),W-200,100,50);ctx.fill();ctx.fillStyle="#000";ctx.font="bold 46px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.cta,W/2,Math.round(H*.44)+66);ctx.textAlign="left";});
    an(0.08,()=>cv(0,Math.round(H*.56),W,Math.round(H*.44),0,Math.round(H*.56),W,Math.round(H*.44)));
    const gf=ctx.createLinearGradient(0,Math.round(H*.56),0,Math.round(H*.56)+150);gf.addColorStop(0,t.bg);gf.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gf;ctx.fillRect(0,Math.round(H*.56),W,150);
  }
}

// ── 컨셉 3: 그라데이션 ──
function c3(ctx:CanvasRenderingContext2D,W:number,H:number,t:T,cv:Cover,_cn:Contain,cvR:CoverR,p:Product,i:number,aT:number,mT:MotionType){
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  const an=makeAn(ctx,W,H,aT,mT);
  if(i===0){
    const rg=ctx.createRadialGradient(W/2,H*.4,100,W/2,H*.4,H*.8);rg.addColorStop(0,t.panel);rg.addColorStop(1,t.bg);ctx.fillStyle=rg;ctx.fillRect(0,0,W,H);
    an(0,()=>cvR(100,120,W-200,Math.round(H*.52),40));
    an(0.07,()=>{ctx.fillStyle=t.accent;ctx.font="bold 32px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.emoji+" "+p.category,80,H*.66);});
    an(0.14,()=>{ctx.fillStyle=t.text;ctx.font="bold 80px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.hook,80,H*.72,W-200,100);});
    const lg=ctx.createLinearGradient(80,0,280,0);lg.addColorStop(0,t.accent);lg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=lg;ctx.fillRect(80,H-80,200*e(0.22),6);
  }else if(i===1){
    const lin=ctx.createLinearGradient(0,0,W,H);lin.addColorStop(0,t.bg);lin.addColorStop(1,t.panel);ctx.fillStyle=lin;ctx.fillRect(0,0,W,H);
    const pH=Math.round(H*.5);
    an(0,()=>cvR(80,80,W-200,pH,32));
    an(0.08,()=>{ctx.fillStyle=t.accent;ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 01",80,pH+100);});
    const gl=ctx.createLinearGradient(80,0,80+W*.4,0);gl.addColorStop(0,t.accent);gl.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=gl;ctx.fillRect(80,pH+120,W*.4*e(0.10),4);
    an(0.15,()=>{ctx.fillStyle=t.text;ctx.font="bold 68px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[0]??"",80,pH+160,W-200,84);});
    an(0.23,()=>{ctx.fillStyle=t.accent+"bb";ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,80,H-80);});
  }else if(i===2){
    const bg2=ctx.createLinearGradient(0,0,W,H);bg2.addColorStop(0,t.panel);bg2.addColorStop(1,t.bg);ctx.fillStyle=bg2;ctx.fillRect(0,0,W,H);
    const px=Math.round(W*.5);
    an(0,()=>cvR(px+40,120,W-px-80,Math.round(H*.65),32));
    ctx.fillStyle=ctx.createLinearGradient(0,H*.15,0,H*.75) as unknown as string;
    const vg=ctx.createLinearGradient(0,H*.15,0,H*.75);vg.addColorStop(0,t.accent);vg.addColorStop(1,"rgba(0,0,0,0)");ctx.fillStyle=vg;ctx.fillRect(80,H*.2*e(0.06),4,H*.55*e(0.06));
    an(0.10,()=>{ctx.fillStyle=t.accent;ctx.font="bold 30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("특징 02",104,H*.22);});
    an(0.16,()=>{ctx.fillStyle=t.text;ctx.font="bold 66px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[1]??"",104,H*.28,px-160,82);});
    an(0.24,()=>{ctx.fillStyle=t.accent+"bb";ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("▸ "+p.targetAudience,104,H*.75);});
  }else if(i===3){
    an(0,()=>cv(0,0,W,H,0,0,W,H));
    const ro=ctx.createRadialGradient(W/2,H/2,H*.1,W/2,H/2,H*.75);ro.addColorStop(0,"rgba(0,0,0,.3)");ro.addColorStop(1,"rgba(0,0,0,.82)");ctx.fillStyle=ro;ctx.fillRect(0,0,W,H);
    const bw=W-200,bh=480,by=H/2-bh/2;
    an(0.05,()=>{ctx.fillStyle="rgba(0,0,0,.45)";ctx.beginPath();ctx.roundRect(80,by,bw,bh,24);ctx.fill();ctx.strokeStyle=t.accent+"66";ctx.lineWidth=1;ctx.beginPath();ctx.roundRect(80,by,bw,bh,24);ctx.stroke();});
    an(0.10,()=>{ctx.fillStyle=t.accent;ctx.font="bold 28px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText("특징 03",W/2,by+60);ctx.textAlign="left";});
    an(0.16,()=>{ctx.fillStyle="#fff";ctx.font="bold 68px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[2]??"",120,by+120,W-240,84);});
    an(0.24,()=>{ctx.fillStyle=t.accent+"aa";ctx.font="30px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText("▸ "+p.targetAudience,W/2,by+bh-40);ctx.textAlign="left";});
  }else{
    const gg=ctx.createLinearGradient(0,0,0,H);gg.addColorStop(0,t.bg);gg.addColorStop(1,t.panel);ctx.fillStyle=gg;ctx.fillRect(0,0,W,H);
    const py=Math.round(H*.14),ph=Math.round(H*.4);
    an(0,()=>cvR(80,py,W-200,ph,36));
    an(0.06,()=>{ctx.font="80px serif";ctx.fillText(p.emoji,80,py+ph+100);});
    an(0.12,()=>{ctx.fillStyle=t.accent;ctx.font="bold 44px 'Apple SD Gothic Neo',sans-serif";const ny=wrapText(ctx,p.productName,80,py+ph+180,W-200,56);ctx.fillStyle=t.text;ctx.font="bold 54px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.mainBenefit,80,ny+36,W-200,68);});
    if(p.price){an(0.20,()=>{ctx.fillStyle=t.accent;ctx.font="bold 50px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.price,80,H*.86);});}
    an(0.26,()=>{const bg3=ctx.createLinearGradient(80,0,W-80,0);bg3.addColorStop(0,t.accent);bg3.addColorStop(1,t.accent+"cc");ctx.fillStyle=bg3;ctx.beginPath();ctx.roundRect(80,Math.round(H*.9),W-200,76,38);ctx.fill();ctx.fillStyle="#000";ctx.font="bold 36px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.cta,W/2,Math.round(H*.9)+50);ctx.textAlign="left";});
  }
}

// ── 컨셉 4: 프리미엄 ──
function c4(ctx:CanvasRenderingContext2D,W:number,H:number,t:T,cv:Cover,_cn:Contain,p:Product,i:number,aT:number,mT:MotionType){
  const e=(d:number)=>eo(Math.min(1,Math.max(0,(aT-d)/0.12)));
  const an=makeAn(ctx,W,H,aT,mT);
  const bg="#080808";ctx.fillStyle=bg;ctx.fillRect(0,0,W,H);
  if(i===0){
    an(0,()=>cv(60,80,W-120,Math.round(H*.55),60,80,W-120,Math.round(H*.55)));
    ctx.save();ctx.globalAlpha=e(0.04);ctx.strokeStyle=t.accent;ctx.lineWidth=1;ctx.strokeRect(60,80,W-120,Math.round(H*.55));ctx.restore();
    an(0.10,()=>{ctx.fillStyle=t.accent;ctx.font="bold 22px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.category.toUpperCase(),W/2,H*.65);ctx.textAlign="left";});
    ctx.fillStyle=t.accent;ctx.fillRect(W/2-40*e(0.14),H*.67,80*e(0.14),1);
    an(0.18,()=>{ctx.fillStyle=t.text;ctx.font="bold 72px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.hook,64,H*.71,W-200,90);});
    ctx.fillStyle=t.accent;ctx.fillRect(64,H-80,(W-200)*e(0.26),1);
  }else if(i===1){
    const pH=Math.round(H*.48);
    an(0,()=>cv(64,80,W-200,pH,64,80,W-200,pH));
    ctx.save();ctx.globalAlpha=e(0.04);ctx.strokeStyle=t.accent+"55";ctx.lineWidth=1;ctx.strokeRect(64,80,W-200,pH);ctx.restore();
    ctx.fillStyle=t.accent;ctx.fillRect(64,pH+120,(W-200)*e(0.08),1);
    an(0.08,()=>{ctx.font="bold 24px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("I  특징 01",64,pH+100);});
    an(0.15,()=>{ctx.fillStyle=t.text;ctx.font="bold 62px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[0]??"",64,pH+160,W-200,78);});
    an(0.23,()=>{ctx.fillStyle=t.accent+"77";ctx.font="28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.targetAudience,64,H-80);});
  }else if(i===2){
    const sx=Math.round(W*.52);
    an(0,()=>cv(sx+40,80,W-sx-80,H-160,sx+40,80,W-sx-80,H-160));
    ctx.save();ctx.globalAlpha=e(0.04);ctx.strokeStyle=t.accent+"55";ctx.lineWidth=1;ctx.strokeRect(sx+40,80,W-sx-80,H-160);ctx.restore();
    ctx.fillStyle=t.accent;ctx.fillRect(64,H*.2,1,H*.6*e(0.06));
    an(0.10,()=>{ctx.font="bold 24px 'Apple SD Gothic Neo',sans-serif";ctx.fillText("II  특징 02",84,H*.22);ctx.fillRect(84,H*.25,sx-120,1);});
    an(0.16,()=>{ctx.fillStyle=t.text;ctx.font="bold 62px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[1]??"",84,H*.3,sx-140,78);});
    an(0.24,()=>{ctx.fillStyle=t.accent+"77";ctx.font="28px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.targetAudience,84,H*.78);});
  }else if(i===3){
    const imgEl=(ctx.canvas as any).__img as HTMLImageElement;
    if(imgEl){ctx.save();ctx.globalAlpha=e(0);const s=Math.max(W/imgEl.width,H/imgEl.height);ctx.drawImage(imgEl,(W-imgEl.width*s)/2,(H-imgEl.height*s)/2,imgEl.width*s,imgEl.height*s);ctx.restore();}
    const vig=ctx.createRadialGradient(W/2,H/2,H*.2,W/2,H/2,H*.82);vig.addColorStop(0,"rgba(0,0,0,.2)");vig.addColorStop(1,"rgba(0,0,0,.88)");ctx.fillStyle=vig;ctx.fillRect(0,0,W,H);
    const bw=W-200,bh=360,by=H/2-bh/2;
    ctx.save();ctx.globalAlpha=e(0.06);ctx.strokeStyle=t.accent+"66";ctx.lineWidth=1;ctx.strokeRect(80,by,bw,bh);ctx.strokeStyle=t.accent+"33";ctx.strokeRect(72,by-8,bw+16,bh+16);ctx.restore();
    an(0.12,()=>{ctx.fillStyle=t.accent;ctx.font="bold 22px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText("III  특징 03",W/2,by+56);ctx.fillRect(W/2-60,by+68,120,1);ctx.textAlign="left";});
    an(0.18,()=>{ctx.fillStyle="#fff";ctx.font="bold 64px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.features[2]??"",120,by+100,W-240,80);});
    an(0.26,()=>{ctx.fillStyle=t.accent+"88";ctx.font="28px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.targetAudience,W/2,by+bh-40);ctx.textAlign="left";});
  }else{
    const fy=80,fh=Math.round(H*.44);
    an(0,()=>cv(64,fy,W-200,fh,64,fy,W-200,fh));
    ctx.save();ctx.globalAlpha=e(0.04);ctx.strokeStyle=t.accent+"55";ctx.lineWidth=1;ctx.strokeRect(64,fy,W-200,fh);ctx.restore();
    ctx.fillStyle=t.accent;ctx.fillRect(64,fy+fh+60,(W-200)*e(0.08),1);
    an(0.10,()=>{ctx.font="60px serif";ctx.fillText(p.emoji,64,fy+fh+130);});
    an(0.16,()=>{ctx.font="bold 40px 'Apple SD Gothic Neo',sans-serif";const ny=wrapText(ctx,p.productName,64,fy+fh+200,W-200,52);ctx.fillStyle=t.text;ctx.font="50px 'Apple SD Gothic Neo',sans-serif";wrapText(ctx,p.mainBenefit,64,ny+36,W-200,64);});
    if(p.price){an(0.22,()=>{ctx.fillStyle=t.accent;ctx.font="bold 52px 'Apple SD Gothic Neo',sans-serif";ctx.fillText(p.price,64,H*.87);});}
    an(0.27,()=>{ctx.strokeStyle=t.accent;ctx.lineWidth=2;const by2=Math.round(H*.91);ctx.beginPath();ctx.roundRect(64,by2,W-200,72,36);ctx.stroke();ctx.fillStyle=t.text;ctx.font="bold 34px 'Apple SD Gothic Neo',sans-serif";ctx.textAlign="center";ctx.fillText(p.cta,W/2,by2+48);ctx.textAlign="left";});
  }
}

// ── 메인 drawCard ──
function drawCard(canvas: HTMLCanvasElement, img: HTMLImageElement, product: Product, index: number, concept = 0, animT = 1, motion: MotionType = "slide-up") {
  const W=1080, H=1920;
  canvas.width=W; canvas.height=H;
  const ctx=canvas.getContext("2d")!;
  const t=THEMES[product.colorTheme]??THEMES.minimal;
  (canvas as any).__img=img;

  const cover: Cover=(cx,cy,cw,ch,dx,dy,dw,dh)=>{
    const s=Math.max(dw/img.width,dh/img.height);
    const iw=img.width*s,ih=img.height*s;
    ctx.save(); ctx.beginPath(); ctx.rect(cx,cy,cw,ch); ctx.clip();
    ctx.drawImage(img,dx+(dw-iw)/2,dy+(dh-ih)/2,iw,ih); ctx.restore();
  };
  const contain: Contain=(dx,dy,dw,dh,bg)=>{
    if(bg){ctx.fillStyle=bg; ctx.fillRect(dx,dy,dw,dh);}
    const s=Math.min(dw/img.width,dh/img.height)*.97;
    const iw=img.width*s,ih=img.height*s;
    ctx.drawImage(img,dx+(dw-iw)/2,dy+(dh-ih)/2,iw,ih);
  };
  const coverR: CoverR=(dx,dy,dw,dh,r)=>{
    const s=Math.max(dw/img.width,dh/img.height);
    const iw=img.width*s,ih=img.height*s;
    ctx.save(); ctx.beginPath(); ctx.roundRect(dx,dy,dw,dh,r); ctx.clip();
    ctx.drawImage(img,dx+(dw-iw)/2,dy+(dh-ih)/2,iw,ih); ctx.restore();
  };

  if(concept===0) c0(ctx,W,H,t,cover,contain,product,index,animT,motion);
  else if(concept===1) c1(ctx,W,H,t,cover,contain,coverR,product,index,animT,motion);
  else if(concept===2) c2(ctx,W,H,t,cover,contain,coverR,product,index,animT,motion);
  else if(concept===3) c3(ctx,W,H,t,cover,contain,coverR,product,index,animT,motion);
  else c4(ctx,W,H,t,cover,contain,product,index,animT,motion);
}

// ── 카드 캔버스 ──
const CardCanvas = forwardRef<HTMLCanvasElement, { image: ImageItem; product: Product; index: number; concept: number }>(
  function CardCanvas({ image, product, index, concept }, ref) {
    const internalRef = useRef<HTMLCanvasElement>(null);
    const setRef = useCallback((el: HTMLCanvasElement | null) => {
      (internalRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
      if (typeof ref==="function") ref(el);
      else if (ref) (ref as React.MutableRefObject<HTMLCanvasElement | null>).current=el;
    }, [ref]);

    useEffect(() => {
      const canvas=internalRef.current; if(!canvas) return;
      const img=new Image();
      img.onload=()=>drawCard(canvas,img,product,index,concept);
      img.src=`data:${image.mediaType};base64,${image.base64}`;
    }, [image, product, index, concept]);

    const download=useCallback(()=>{
      const canvas=internalRef.current; if(!canvas) return;
      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/jpeg",.92);
      a.download=`card_${index+1}_${product.productName.slice(0,10)}.jpg`;
      a.click();
    },[index,product.productName]);

    return (
      <div className="relative group">
        <canvas ref={setRef} className="w-full rounded-xl" />
        <button onClick={download}
          className="absolute bottom-2 right-2 h-8 px-3 text-xs rounded-lg bg-black/70 text-white opacity-0 group-hover:opacity-100 transition">
          저장
        </button>
      </div>
    );
  }
);

// ── 나레이션 대본 ──
function ScriptPanel({ script, productName }: { script: string; productName: string }) {
  const [copied, setCopied] = useState(false);
  const lines = script.split("/").map(s=>s.trim()).filter(Boolean);
  const copy = useCallback(async () => {
    await navigator.clipboard.writeText(lines.join("\n"));
    setCopied(true); setTimeout(()=>setCopied(false),2000);
  },[lines]);
  const dl = useCallback(()=>{
    const blob=new Blob([lines.join("\n")],{type:"text/plain;charset=utf-8"});
    const a=document.createElement("a");
    a.href=URL.createObjectURL(blob); a.download=`script_${productName.slice(0,10)}.txt`; a.click();
    URL.revokeObjectURL(a.href);
  },[lines,productName]);
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--hover)] p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider">🎙 15초 나레이션 대본</span>
        <div className="flex gap-2">
          <button onClick={copy} className="h-6 px-2.5 text-[11px] rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--active)] transition">
            {copied?"복사됨 ✓":"복사"}
          </button>
          <button onClick={dl} className="h-6 px-2.5 text-[11px] rounded-md border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--active)] transition">txt</button>
        </div>
      </div>
      <ol className="flex flex-col gap-1.5">
        {lines.map((line,i)=>(
          <li key={i} className="flex gap-2.5 items-start text-sm">
            <span className="text-[var(--text-muted)] text-xs mt-0.5 w-4 shrink-0">{i+1}</span>
            <span className="text-[var(--text)]">{line}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

const TRANSITIONS: { key: TransitionType; name: string; desc: string; feel: string }[] = [
  { key: "crossfade",   name: "크로스페이드", desc: "두 카드가 겹치며 부드럽게 전환",       feel: "감성 · 무난"    },
  { key: "slide-up",   name: "슬라이드 업",  desc: "다음 카드가 아래서 밀고 올라옴",      feel: "TikTok · 역동"  },
  { key: "slide-left", name: "슬라이드 옆",  desc: "카드가 옆으로 밀려나며 전환",         feel: "카드뉴스 · 깔끔" },
  { key: "fade-black", name: "페이드 블랙",  desc: "검은 화면을 거쳐 다음 카드로",        feel: "드라마 · 고급"  },
  { key: "zoom-fade",  name: "줌 페이드",   desc: "살짝 확대되며 다음 카드로 전환",       feel: "광고 · 임팩트"  },
];

const MOTIONS: { key: MotionType; name: string; desc: string; feel: string }[] = [
  { key: "slide-up",   name: "슬라이드 업",  desc: "요소들이 아래서 위로 올라오며 등장",  feel: "역동 · 생동감" },
  { key: "fade",       name: "페이드인",     desc: "요소들이 순서대로 스르르 나타남",     feel: "감성 · 부드러움" },
  { key: "drop",       name: "드롭",        desc: "요소들이 위에서 아래로 내려오며 등장", feel: "힙 · 임팩트"  },
  { key: "slide-left", name: "슬라이드 우",  desc: "요소들이 오른쪽에서 밀려 들어옴",    feel: "에디토리얼 · 세련" },
  { key: "zoom",       name: "줌인",        desc: "화면이 확대되며 등장하는 느낌",       feel: "광고 · 강렬"  },
];

// ── 영상 모달 ──
function VideoModal({ item, conceptIdx, onClose }: { item: ResultItem; conceptIdx: number; onClose: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgsRef = useRef<HTMLImageElement[]>([]);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [phase, setPhase] = useState<VideoPhase>("idle");
  const [progress, setProgress] = useState(0);
  const [transition, setTransition] = useState<TransitionType>("crossfade");
  const [motion, setMotion] = useState<MotionType>("slide-up");
  const [webmBlob, setWebmBlob] = useState<Blob | null>(null);
  const [mp4Url, setMp4Url] = useState<string | null>(null);
  const [mp4Loading, setMp4Loading] = useState(false);
  const [mp4Error, setMp4Error] = useState<string | null>(null);
  const { product, images } = item;

  // 이미지 프리로드 + 첫 카드 미리보기
  useEffect(() => {
    if (!product) return;
    const loadImg = (src: string): Promise<HTMLImageElement> =>
      new Promise(res => { const img = new Image(); img.onload = () => res(img); img.src = src; });
    (async () => {
      const imgs = await Promise.all(images.map(im => loadImg(`data:${im.mediaType};base64,${im.base64}`)));
      imgsRef.current = imgs;
      if (canvasRef.current) {
        const c = canvasRef.current;
        c.width = 540; c.height = 960;
        const off = document.createElement("canvas");
        drawCard(off, imgs[0], product, 0, conceptIdx);
        const ctx = c.getContext("2d")!;
        ctx.save(); ctx.scale(0.5, 0.5); ctx.drawImage(off, 0, 0); ctx.restore();
      }
    })();
    return () => { cleanupRef.current?.(); };
  }, [product, images, conceptIdx]);

  const startRecording = useCallback(() => {
    if (!canvasRef.current || imgsRef.current.length === 0 || !product) return;
    const canvas = canvasRef.current;
    const RW = 540, RH = 960;
    canvas.width = RW; canvas.height = RH;
    const sd = RW / 1080;
    const imgs = imgsRef.current;
    const offA = document.createElement("canvas"); offA.width = 1080; offA.height = 1920;
    const offB = document.createElement("canvas"); offB.width = 1080; offB.height = 1920;
    let af = 0, stopped = false;

    const mimeType = [
      "video/mp4;codecs=h264,mp4a.40.2", "video/mp4;codecs=avc1", "video/mp4",
      "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm",
    ].find(t => MediaRecorder.isTypeSupported(t)) ?? "video/webm";
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_000_000 });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => { if (!stopped) { setWebmBlob(new Blob(chunks, { type: mimeType })); setPhase("done"); } };
    recorder.start(200);
    setPhase("recording");

    const CARD_MS = 5000, FADE_MS = 800, TOTAL_MS = 25000;
    const tr = transition, mt = motion;
    let start = -1;
    const tick = (now: number) => {
      if (stopped) return;
      if (start < 0) start = now;
      const elapsed = now - start;
      if (elapsed >= TOTAL_MS) { recorder.stop(); return; }

      const ci = Math.min(Math.floor(elapsed / CARD_MS), 4);
      const cf = elapsed % CARD_MS;
      const cardT = cf / CARD_MS;
      const inFade = cf > CARD_MS - FADE_MS && ci < 4;
      const tp = inFade ? eo((cf - (CARD_MS - FADE_MS)) / FADE_MS) : 0;

      // 현재 카드 동적 렌더링
      drawCard(offA, imgs[ci % imgs.length], product, ci, conceptIdx, cardT, mt);

      const ctx = canvas.getContext("2d")!;
      ctx.clearRect(0, 0, RW, RH);
      ctx.save(); ctx.scale(sd, sd);

      if (!inFade) {
        ctx.drawImage(offA, 0, 0);
      } else {
        // 다음 카드 렌더링 (animT=0: 등장 시작)
        drawCard(offB, imgs[(ci + 1) % imgs.length], product, ci + 1, conceptIdx, 0, mt);
        if (tr === "crossfade") {
          ctx.save(); ctx.globalAlpha = 1 - tp; ctx.drawImage(offA, 0, 0); ctx.restore();
          ctx.save(); ctx.globalAlpha = tp; ctx.drawImage(offB, 0, 0); ctx.restore();
        } else if (tr === "slide-up") {
          ctx.save(); ctx.drawImage(offA, 0, -tp * 1920); ctx.restore();
          ctx.save(); ctx.drawImage(offB, 0, (1 - tp) * 1920); ctx.restore();
        } else if (tr === "slide-left") {
          ctx.save(); ctx.drawImage(offA, -tp * 1080, 0); ctx.restore();
          ctx.save(); ctx.drawImage(offB, (1 - tp) * 1080, 0); ctx.restore();
        } else if (tr === "fade-black") {
          if (tp < 0.5) { ctx.save(); ctx.globalAlpha = 1 - tp * 2; ctx.drawImage(offA, 0, 0); ctx.restore(); }
          else { ctx.save(); ctx.globalAlpha = (tp - 0.5) * 2; ctx.drawImage(offB, 0, 0); ctx.restore(); }
        } else if (tr === "zoom-fade") {
          ctx.save(); ctx.globalAlpha = 1 - tp;
          ctx.translate(540, 960); ctx.scale(1 + tp * 0.06, 1 + tp * 0.06); ctx.translate(-540, -960);
          ctx.drawImage(offA, 0, 0); ctx.restore();
          ctx.save(); ctx.globalAlpha = tp;
          ctx.translate(540, 960); ctx.scale(0.97 + tp * 0.03, 0.97 + tp * 0.03); ctx.translate(-540, -960);
          ctx.drawImage(offB, 0, 0); ctx.restore();
        }
      }

      ctx.restore();
      setProgress(elapsed / TOTAL_MS);
      af = requestAnimationFrame(tick);
    };
    af = requestAnimationFrame(tick);
    cleanupRef.current = () => { stopped = true; cancelAnimationFrame(af); };
  }, [transition, motion, product, conceptIdx]);

  const dlWebm = () => {
    if (!webmBlob || !product) return;
    const ext = webmBlob.type.startsWith("video/mp4") ? "mp4" : "webm";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(webmBlob);
    a.download = `${product.productName.slice(0, 12)}_cards.${ext}`;
    a.click(); URL.revokeObjectURL(a.href);
  };

  const toMp4 = async () => {
    if (!webmBlob || !product) return;
    // 이미 MP4면 바로 다운로드
    if (webmBlob.type.startsWith("video/mp4")) { dlWebm(); return; }
    setMp4Loading(true); setMp4Error(null);
    try {
      const ext = "webm";
      const fd = new FormData();
      fd.append("file", webmBlob, `cards.${ext}`);
      const up = await fetch("/api/upload-blob", { method: "POST", body: fd });
      const upD = await up.json();
      if (!up.ok || !upD.url) throw new Error(upD.error ?? "업로드 실패");
      const rn = await fetch("/api/render-video", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenes: [{ videoUrl: upD.url, duration: 25 }], projectName: product.productName.slice(0, 12) }),
      });
      const rnD = await rn.json();
      if (!rn.ok || !rnD.outputUrl) throw new Error(rnD.error ?? "렌더 실패");
      setMp4Url(rnD.outputUrl);
    } catch (e) { setMp4Error(e instanceof Error ? e.message : "변환 실패"); }
    setMp4Loading(false);
  };

  if (!product) return null;
  return (
    <div className="mt-4 border border-[var(--border)] rounded-2xl overflow-hidden bg-[var(--bg)]">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
          <span className="font-semibold text-sm">카드 영상 25초 (5장×5초)</span>
          <button onClick={onClose} className="text-[var(--text-muted)] hover:text-[var(--text)] text-2xl leading-none">×</button>
        </div>
        {/* 2열: 왼쪽 캔버스 / 오른쪽 옵션 */}
        <div className="flex h-[460px] overflow-hidden">
          {/* 왼쪽: 캔버스 */}
          <div className="w-[42%] flex-shrink-0 p-3 flex items-center justify-center border-r border-[var(--border)]">
            <canvas ref={canvasRef} className="rounded-xl" style={{ aspectRatio: "9/16", maxHeight: "100%", width: "auto" }} />
          </div>
          {/* 오른쪽: 옵션 + 버튼 */}
          <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-3">
          {phase === "idle" && (
            <div className="flex flex-col gap-3">
              {/* 전환 효과 */}
              <div className="flex flex-col gap-1.5">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">카드 전환</span>
                {TRANSITIONS.map(tr => (
                  <button key={tr.key} onClick={() => setTransition(tr.key)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition ${
                      transition === tr.key ? "border-[var(--text)] bg-[var(--hover)]" : "border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}>
                    <span className={`w-3 h-3 rounded-full border-2 shrink-0 transition ${transition === tr.key ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border)]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold">{tr.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-px rounded-full">{tr.feel}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">{tr.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              {/* 카드 내 모션 */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-[var(--border)]">
                <span className="text-[10px] text-[var(--text-muted)] uppercase tracking-wider">카드 내 모션</span>
                {MOTIONS.map(mo => (
                  <button key={mo.key} onClick={() => setMotion(mo.key)}
                    className={`flex items-center gap-3 px-3 py-2 rounded-xl border text-left transition ${
                      motion === mo.key ? "border-[var(--text)] bg-[var(--hover)]" : "border-[var(--border)] hover:bg-[var(--hover)]"
                    }`}>
                    <span className={`w-3 h-3 rounded-full border-2 shrink-0 transition ${motion === mo.key ? "bg-[var(--text)] border-[var(--text)]" : "border-[var(--border)]"}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-xs font-semibold">{mo.name}</span>
                        <span className="text-[10px] text-[var(--text-muted)] border border-[var(--border)] px-1.5 py-px rounded-full">{mo.feel}</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">{mo.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
              <button onClick={startRecording}
                className="w-full h-10 rounded-xl bg-[var(--text)] text-[#0a0a0a] text-sm font-bold hover:opacity-90 transition">
                녹화 시작
              </button>
            </div>
          )}
          {phase === "recording" && (
            <div>
              <div className="flex justify-between text-xs text-[var(--text-muted)] mb-1.5">
                <span>녹화 중</span>
                <span>{Math.round(progress * 25)}s / 25s</span>
              </div>
              <div className="h-1.5 bg-[var(--hover)] rounded-full overflow-hidden">
                <div className="h-full bg-[var(--text)] rounded-full transition-all duration-100" style={{ width: `${progress * 100}%` }} />
              </div>
            </div>
          )}
          {phase === "done" && (
            <>
              <button onClick={dlWebm} className="w-full h-9 rounded-lg border border-[var(--border)] text-sm font-medium hover:bg-[var(--hover)] transition">
                {webmBlob?.type.startsWith("video/mp4") ? "MP4 다운로드" : "WebM 다운로드"}
              </button>
              {!webmBlob?.type.startsWith("video/mp4") && !mp4Url ? (
                <button onClick={toMp4} disabled={mp4Loading}
                  className="w-full h-9 rounded-lg bg-[var(--text)] text-[#0a0a0a] text-sm font-semibold hover:opacity-90 transition disabled:opacity-50">
                  {mp4Loading ? "Lambda 변환 중..." : "MP4 변환 (Lambda)"}
                </button>
              ) : (
                <a href={mp4Url ?? ""} download={`${product.productName.slice(0, 12)}.mp4`}
                  className="w-full h-9 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:opacity-90 transition flex items-center justify-center">
                  MP4 저장 ↓
                </a>
              )}
              {mp4Error && <p className="text-xs text-red-400 text-center">{mp4Error}</p>}
            </>
          )}
          </div>{/* /오른쪽 옵션 */}
        </div>{/* /2열 */}
    </div>
  );
}

// ── 상품 결과 ──
function ProductResult({ item, onRemove }: { item: ResultItem; onRemove: () => void }) {
  const { product, error, loading, images } = item;
  const [selectedTheme, setSelectedTheme] = useState("minimal");
  const [videoConceptIdx, setVideoConceptIdx] = useState<number | null>(null);
  const cardRefs = useRef<Record<string, HTMLCanvasElement | null>>({});

  useEffect(()=>{ if(product?.colorTheme) setSelectedTheme(product.colorTheme); },[product?.colorTheme]);

  const downloadRow = useCallback((ci: number)=>{
    if(!product) return;
    [0,1,2,3,4].forEach(i=>{
      const canvas=cardRefs.current[`${ci}-${i}`]; if(!canvas) return;
      const a=document.createElement("a");
      a.href=canvas.toDataURL("image/jpeg",.92);
      a.download=`${CONCEPT_META[ci].label}_card${i+1}_${product.productName.slice(0,10)}.jpg`;
      a.click();
    });
  },[product]);

  return (
    <div className="border border-[var(--border)] rounded-xl p-5 mb-8">
      {/* 헤더 */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-1 shrink-0">
          {images.slice(0,3).map((img,i)=>(
            <img key={i} src={img.preview} alt="" className="w-10 h-10 rounded-md object-cover" />
          ))}
          {images.length>3 && (
            <div className="w-10 h-10 rounded-md bg-[var(--hover)] flex items-center justify-center text-[10px] text-[var(--text-muted)]">+{images.length-3}</div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          {loading && <p className="text-sm text-[var(--text-muted)] animate-pulse">분석 중...</p>}
          {error && <p className="text-sm text-red-400">{error}</p>}
          {product && (
            <>
              <p className="font-semibold text-sm truncate">{product.productName}</p>
              {product.price && <p className="text-xs text-[var(--text-muted)]">{product.price}</p>}
            </>
          )}
        </div>
        <button onClick={onRemove}
          className="h-7 px-2.5 text-xs rounded-lg border border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)] transition shrink-0">
          삭제
        </button>
      </div>

      {product && (
        <>
          {/* 컬러 선택 (전체 공통) */}
          <div className="flex flex-wrap gap-2 mb-5 pb-4 border-b border-[var(--border)]">
            <span className="text-[10px] text-[var(--text-muted)] self-center uppercase tracking-wider mr-1">컬러</span>
            {THEME_META.map(tm=>(
              <button key={tm.key} onClick={()=>setSelectedTheme(tm.key)}
                className={`flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition border ${
                  selectedTheme===tm.key
                    ? "border-[var(--text)] bg-[var(--hover)] font-medium"
                    : "border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]"
                }`}>
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{background:tm.color}} />
                {tm.label}
                {product.colorTheme===tm.key && <span className="text-[9px] opacity-60">AI</span>}
              </button>
            ))}
          </div>

          {/* 스타일별 개별 행 */}
          {CONCEPT_META.map((concept,ci)=>(
            <div key={ci} className="mb-8">
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold text-sm">{concept.label}</span>
                <div className="flex gap-2">
                  <button onClick={()=>downloadRow(ci)}
                    className="h-7 px-3 text-xs rounded-lg bg-[var(--text)] text-[#0a0a0a] font-semibold hover:opacity-90 transition">
                    저장
                  </button>
                  <button onClick={()=>setVideoConceptIdx(videoConceptIdx===ci?null:ci)}
                    className={`h-7 px-3 text-xs rounded-lg border transition ${videoConceptIdx===ci?"border-[var(--text)] bg-[var(--hover)] text-[var(--text)]":"border-[var(--border)] text-[var(--text-muted)] hover:bg-[var(--hover)]"}`}>
                    영상
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {[0,1,2,3,4].map(i=>(
                  <CardCanvas
                    key={`${ci}-${selectedTheme}-${i}`}
                    ref={el=>{cardRefs.current[`${ci}-${i}`]=el;}}
                    image={images[i%images.length]}
                    product={{...product,colorTheme:selectedTheme}}
                    index={i}
                    concept={ci}
                  />
                ))}
              </div>
              {product.scripts?.[concept.key as keyof typeof product.scripts] && (
                <ScriptPanel
                  script={product.scripts[concept.key as keyof typeof product.scripts]}
                  productName={product.productName}
                />
              )}
              {videoConceptIdx === ci && (
                <VideoModal item={item} conceptIdx={ci} onClose={()=>setVideoConceptIdx(null)} />
              )}
            </div>
          ))}
        </>
      )}
    </div>
  );
}

// ── 메인 페이지 ──
export default function CardsPage() {
  const [results, setResults] = useState<ResultItem[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const readFile = (file: File): Promise<ImageItem> =>
    new Promise(resolve => {
      const reader = new FileReader();
      reader.onload = e => {
        const dataUrl = e.target?.result as string;
        resolve({ base64: dataUrl.split(",")[1], mediaType: file.type, preview: dataUrl });
      };
      reader.readAsDataURL(file);
    });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const imageFiles = Array.from(files).filter(f => f.type.startsWith("image/"));
    if (imageFiles.length === 0) return;
    setGlobalLoading(true);
    const images = await Promise.all(imageFiles.map(readFile));
    const newItem: ResultItem = { id: crypto.randomUUID(), images, product: null, error: null, loading: true };
    setResults(prev => [newItem, ...prev]);
    try {
      const res = await fetch("/api/analyze-product", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: images[0].base64, mediaType: images[0].mediaType }),
      });
      const data = await res.json();
      setResults(prev => prev.map(r => r.id === newItem.id
        ? { ...r, product: res.ok ? data.product : null, error: res.ok ? null : (data.error || "오류"), loading: false }
        : r
      ));
    } catch {
      setResults(prev => prev.map(r => r.id === newItem.id ? { ...r, error: "분석 실패", loading: false } : r));
    }
    setGlobalLoading(false);
  };

  return (
    <div className="max-w-4xl mx-auto p-8">
      <h1 className="text-xl font-semibold mb-1">카드뉴스 생성</h1>
      <p className="text-sm text-[var(--text-muted)] mb-6">쿠팡 상품 캡처를 올리면 인스타 릴스/스토리 1080×1920 카드뉴스 5장을 만들어 드려요.</p>
      <div
        onDrop={e=>{e.preventDefault();handleFiles(e.dataTransfer.files);}}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>inputRef.current?.click()}
        className="border-2 border-dashed border-[var(--border)] rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-[var(--border2)] hover:bg-[var(--hover)] transition mb-10"
      >
        <div className="text-3xl">🖼️</div>
        <p className="text-sm text-[var(--text-muted)]">클릭하거나 이미지를 끌어다 놓으세요</p>
        <p className="text-xs text-[var(--text-muted)]">여러 장 동시 가능 (카드별 사진 분배) · 쿠팡 상세페이지 캡처 권장</p>
        {globalLoading && <p className="text-xs text-[var(--text-muted)] animate-pulse mt-1">분석 중...</p>}
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={e=>handleFiles(e.target.files)} />
      </div>
      {results.map(item => (
        <ProductResult key={item.id} item={item} onRemove={()=>setResults(prev=>prev.filter(r=>r.id!==item.id))} />
      ))}
    </div>
  );
}
