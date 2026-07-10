(() => {
  const oldCanvas = document.getElementById('space');
  if (!oldCanvas) return;
  const canvas = oldCanvas.cloneNode(false);
  canvas.setAttribute('aria-label', 'Simulador 3D WebGL del sistema Sol Tierra');
  const gl = canvas.getContext('webgl', { antialias: true, alpha: false });
  if (!gl) {
    console.warn('WebGL no está disponible; se mantiene el simulador original.');
    return;
  }
  oldCanvas.replaceWith(canvas);

  const dayS = document.getElementById('day');
  const hourS = document.getElementById('hour');
  const dayLab = document.getElementById('dayLab');
  const hourLab = document.getElementById('hourLab');
  const read = document.getElementById('read');

  const DEG = Math.PI / 180;
  const TILT = 23.44 * DEG;
  const ORBIT_R = 3.45;
  const EARTH_R = 0.72;
  const SUN_R = 0.48;
  let yaw = -0.72;
  let pitch = 0.36;
  let dist = 8;
  let target = [0, 0, 0];
  let drag = null;

  const add = (a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
  const sub = (a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
  const mul = (a,s)=>[a[0]*s,a[1]*s,a[2]*s];
  const dot = (a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
  const cross = (a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const len = a=>Math.hypot(a[0],a[1],a[2]);
  const norm = a=>{ const l=len(a)||1; return [a[0]/l,a[1]/l,a[2]/l]; };

  function epos(doy){ const a=2*Math.PI*(doy-cycleStart)/365; return [ORBIT_R*Math.cos(a),0,ORBIT_R*Math.sin(a)]; }
  function surf(lat,lon){ lat*=DEG; lon*=DEG; return [Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)]; }
  function m4(){ return [1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]; }
  function mm(a,b){ const o=new Array(16); for(let r=0;r<4;r++) for(let c=0;c<4;c++) o[c*4+r]=a[0*4+r]*b[c*4+0]+a[1*4+r]*b[c*4+1]+a[2*4+r]*b[c*4+2]+a[3*4+r]*b[c*4+3]; return o; }
  function tr(v){ const o=m4(); o[12]=v[0]; o[13]=v[1]; o[14]=v[2]; return o; }
  function sc(s){ const o=m4(); o[0]=o[5]=o[10]=s; return o; }
  function rx(a){ const c=Math.cos(a),s=Math.sin(a),o=m4(); o[5]=c; o[6]=s; o[9]=-s; o[10]=c; return o; }
  function ry(a){ const c=Math.cos(a),s=Math.sin(a),o=m4(); o[0]=c; o[2]=-s; o[8]=s; o[10]=c; return o; }
  function perspective(fovy,aspect,near,far){ const f=1/Math.tan(fovy/2),nf=1/(near-far); return [f/aspect,0,0,0, 0,f,0,0, 0,0,(far+near)*nf,-1, 0,0,2*far*near*nf,0]; }
  function lookAt(eye,center,up){ const z=norm(sub(eye,center)),x=norm(cross(up,z)),y=cross(z,x); return [x[0],y[0],z[0],0, x[1],y[1],z[1],0, x[2],y[2],z[2],0, -dot(x,eye),-dot(y,eye),-dot(z,eye),1]; }
  function tv(m,v){ return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2],m[1]*v[0]+m[5]*v[1]+m[9]*v[2],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]]; }
  function tp(m,v){ return [m[0]*v[0]+m[4]*v[1]+m[8]*v[2]+m[12],m[1]*v[0]+m[5]*v[1]+m[9]*v[2]+m[13],m[2]*v[0]+m[6]*v[1]+m[10]*v[2]+m[14]]; }

  function resize(){ const r=canvas.getBoundingClientRect(),d=window.devicePixelRatio||1; canvas.width=Math.max(1,Math.round(r.width*d)); canvas.height=Math.max(1,Math.round(r.height*d)); gl.viewport(0,0,canvas.width,canvas.height); }
  window.addEventListener('resize', resize);
  resize();

  function shader(type,src){ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
  function program(vs,fs){ const p=gl.createProgram(); gl.attachShader(p,shader(gl.VERTEX_SHADER,vs)); gl.attachShader(p,shader(gl.FRAGMENT_SHADER,fs)); gl.linkProgram(p); if(!gl.getProgramParameter(p,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); return p; }
  const earthP=program(
    'attribute vec3 a;attribute vec2 u;uniform mat4 m,vp;varying vec3 n,w;varying vec2 uv;void main(){n=normalize(a);vec4 wp=m*vec4(a,1.0);w=normalize((m*vec4(a,0.0)).xyz);uv=u;gl_Position=vp*wp;}',
    'precision mediump float;varying vec3 n,w;varying vec2 uv;uniform sampler2D tex;uniform vec3 l;uniform float subLat;void main(){float lit=max(dot(normalize(w),normalize(l)),0.0);vec3 base=texture2D(tex,uv).rgb;vec3 night=base*vec3(.10,.15,.28);vec3 day=base*(.42+.82*lit);float lat=asin(clamp(n.y,-1.0,1.0));float band=exp(-pow((lat-subLat)/.34,2.0))*lit;float broad=exp(-pow((lat-subLat)/.82,2.0))*lit;vec3 heat=vec3(1.0,.66,.12)*(.45*band+.16*broad);vec3 color=mix(night,day+heat,smoothstep(0.0,.08,lit));gl_FragColor=vec4(color,1.0);}'
  );
  const colorP=program('attribute vec3 a;uniform mat4 m,vp;uniform float ps;void main(){gl_Position=vp*m*vec4(a,1.0);gl_PointSize=ps;}', 'precision mediump float;uniform vec4 c;void main(){gl_FragColor=c;}');
  const sunP=program('attribute vec3 a;uniform mat4 m,vp;varying vec3 n;void main(){n=normalize(a);gl_Position=vp*m*vec4(a,1.0);}', 'precision mediump float;varying vec3 n;void main(){float g=.7+.3*dot(normalize(n),normalize(vec3(-.3,.7,.6)));gl_FragColor=vec4(vec3(1.0,.72,.10)*g+vec3(.25,.12,0),1.0);}');

  function buf(data,target=gl.ARRAY_BUFFER){ const b=gl.createBuffer(); gl.bindBuffer(target,b); gl.bufferData(target,data,gl.STATIC_DRAW); return b; }
  function sphere(la=64,lo=96){ const p=[],u=[],idx=[]; for(let y=0;y<=la;y++){ const v=y/la,lat=Math.PI/2-v*Math.PI; for(let x=0;x<=lo;x++){ const uu=x/lo,lon=uu*2*Math.PI-Math.PI; p.push(Math.cos(lat)*Math.cos(lon),Math.sin(lat),Math.cos(lat)*Math.sin(lon)); u.push(uu,1-v); }} for(let y=0;y<la;y++) for(let x=0;x<lo;x++){ const a=y*(lo+1)+x,b=a+lo+1; idx.push(a,b,a+1,b,b+1,a+1); } return {p:new Float32Array(p),u:new Float32Array(u),i:new Uint16Array(idx),c:idx.length}; }
  const sph=sphere(); sph.pb=buf(sph.p); sph.ub=buf(sph.u); sph.ib=buf(sph.i,gl.ELEMENT_ARRAY_BUFFER);
  function line(points){ return {b:buf(new Float32Array(points.flat())),c:points.length}; }
  const orbit=[]; for(let i=0;i<=360;i++){ const a=i/360*2*Math.PI; orbit.push([ORBIT_R*Math.cos(a),0,ORBIT_R*Math.sin(a)]); }
  const orbitB=line(orbit), axisB=line([[0,-1.35,0],[0,1.35,0]]);
  function latLine(lat){ const pts=[]; for(let i=0;i<=240;i++) pts.push(surf(lat,-180+i*360/240)); return line(pts); }
  const eqB=latLine(0), tropNB=latLine(23.44), tropSB=latLine(-23.44);

  function texture(){ const cnv=document.createElement('canvas'); cnv.width=1024; cnv.height=512; const c=cnv.getContext('2d'); c.fillStyle='#2f82bd'; c.fillRect(0,0,1024,512); c.strokeStyle='rgba(255,255,255,.12)'; c.lineWidth=1; for(let lon=-180;lon<=180;lon+=30){ const x=(lon+180)/360*1024; c.beginPath(); c.moveTo(x,0); c.lineTo(x,512); c.stroke(); } for(let lat=-60;lat<=60;lat+=30){ const y=(90-lat)/180*512; c.beginPath(); c.moveTo(0,y); c.lineTo(1024,y); c.stroke(); } const xy=(lat,lon)=>[(lon+180)/360*1024,(90-lat)/180*512]; c.fillStyle='#5d9f4b'; c.strokeStyle='#31582d'; c.lineWidth=2; Object.values(continents).forEach(poly=>{ c.beginPath(); poly.forEach((p,i)=>{ const q=xy(p[0],p[1]); i?c.lineTo(q[0],q[1]):c.moveTo(q[0],q[1]); }); c.closePath(); c.fill(); c.stroke(); }); const ch=xy(-33.45,-70.66); c.fillStyle='#ff1744'; c.beginPath(); c.arc(ch[0],ch[1],7,0,7); c.fill(); c.strokeStyle='#fff'; c.lineWidth=2; c.stroke(); const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true); gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,cnv); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR); gl.generateMipmap(gl.TEXTURE_2D); return t; }
  const tex=texture();

  function attr(p,name,b,size){ const l=gl.getAttribLocation(p,name); if(l<0)return; gl.bindBuffer(gl.ARRAY_BUFFER,b); gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l,size,gl.FLOAT,false,0,0); }
  function mat(p,name,x){ const l=gl.getUniformLocation(p,name); if(l)gl.uniformMatrix4fv(l,false,new Float32Array(x)); }
  function vec(p,name,x){ const l=gl.getUniformLocation(p,name); if(l)gl.uniform3fv(l,new Float32Array(x)); }
  function fl(p,name,x){ const l=gl.getUniformLocation(p,name); if(l)gl.uniform1f(l,x); }
  function col(p,x){ gl.uniform4fv(gl.getUniformLocation(p,'c'),new Float32Array(x)); }
  function drawLine(lb,m,vp,c){ gl.useProgram(colorP); attr(colorP,'a',lb.b,3); mat(colorP,'m',m); mat(colorP,'vp',vp); col(colorP,c); fl(colorP,'ps',4); gl.drawArrays(gl.LINE_STRIP,0,lb.c); }
  function drawPoint(pos,vp,c,ps=8){ if(!drawPoint.b)drawPoint.b=buf(new Float32Array([0,0,0])); gl.useProgram(colorP); attr(colorP,'a',drawPoint.b,3); mat(colorP,'m',tr(pos)); mat(colorP,'vp',vp); col(colorP,c); fl(colorP,'ps',ps); gl.drawArrays(gl.POINTS,0,1); }
  function tempLine(points,vp,c){ const lb=line(points); drawLine(lb,m4(),vp,c); gl.deleteBuffer(lb.b); }
  function camera(){ const eye=add(target,[dist*Math.cos(pitch)*Math.sin(yaw),dist*Math.sin(pitch),dist*Math.cos(pitch)*Math.cos(yaw)]); const v=lookAt(eye,target,[0,1,0]); const p=perspective(45*DEG,canvas.width/canvas.height,.1,60); return {eye,v,p,vp:mm(p,v),right:norm([v[0],v[4],v[8]]),up:norm([v[1],v[5],v[9]])}; }
  function project(p,vp){ const x=vp[0]*p[0]+vp[4]*p[1]+vp[8]*p[2]+vp[12], y=vp[1]*p[0]+vp[5]*p[1]+vp[9]*p[2]+vp[13], w=vp[3]*p[0]+vp[7]*p[1]+vp[11]*p[2]+vp[15]; return {x:(x/w*.5+.5)*canvas.clientWidth,y:(-.5*y/w+.5)*canvas.clientHeight}; }

  gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(.03,.06,.12,1);

  function render(){ const doy=+dayS.value,hour=+hourS.value,row=byDoy[doy],EP=epos(doy),cam=camera(),vp=cam.vp; resize(); gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT); const light=norm(mul(EP,-1)); const daily=-hour/24*2*Math.PI; const earthM=mm(tr(EP),mm(rx(TILT),mm(ry(daily),sc(EARTH_R)))); const inv=mm(ry(hour/24*2*Math.PI),rx(-TILT)); const localLight=norm(tv(inv,light)); const subLat=Math.asin(Math.max(-1,Math.min(1,localLight[1])));
    drawLine(orbitB,m4(),vp,[.62,.83,1,.55]); [[79,[.96,.75,.38,1]],[172,[.55,.84,1,1]],[265,[.70,1,.38,1]],[355,[.45,.92,.48,1]]].forEach(x=>drawPoint(epos(x[0]),vp,x[1],9));
    let bd=norm(EP),u=norm(cross(bd,[0,1,0])); if(len(u)<.01)u=[1,0,0]; const v=norm(cross(bd,u)); gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE); for(let i=0;i<18;i++){ const a=i/18*2*Math.PI,off=add(mul(u,Math.cos(a)*EARTH_R*.95),mul(v,Math.sin(a)*EARTH_R*.95)); tempLine([mul(off,.12),add(EP,off)],vp,[1,.82,.16,.18]); } gl.disable(gl.BLEND); gl.enable(gl.DEPTH_TEST);
    gl.useProgram(sunP); attr(sunP,'a',sph.pb,3); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,sph.ib); mat(sunP,'m',mm(tr([0,0,0]),sc(SUN_R))); mat(sunP,'vp',vp); gl.drawElements(gl.TRIANGLES,sph.c,gl.UNSIGNED_SHORT,0);
    gl.useProgram(earthP); attr(earthP,'a',sph.pb,3); attr(earthP,'u',sph.ub,2); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,sph.ib); mat(earthP,'m',earthM); mat(earthP,'vp',vp); vec(earthP,'l',light); fl(earthP,'subLat',subLat); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D,tex); gl.uniform1i(gl.getUniformLocation(earthP,'tex'),0); gl.drawElements(gl.TRIANGLES,sph.c,gl.UNSIGNED_SHORT,0);
    drawLine(eqB,earthM,vp,[1,1,1,.45]); drawLine(row.declination>=0?tropNB:tropSB,earthM,vp,[1,.88,.18,.95]); drawLine(axisB,earthM,vp,[1,1,1,.95]); drawPoint(tp(earthM,surf(-33.45,-70.66)),vp,[1,.05,.18,1],9);
    const pr=project(EP,vp); window.earthScreen={x:pr.x,y:pr.y,r:Math.max(50,canvas.clientWidth/dist*.18)}; const hemi=row.declination<-.4?'sur':(row.declination>.4?'norte':'ninguno'); dayLab.textContent=`${fmtDate(row.date)} · día ${row.doy}`; hourLab.textContent=`${hour.toFixed(2)} h`; const sr=Math.max(0,Math.min(100,row.sunriseDec/24*100)),ss=Math.max(0,Math.min(100,row.sunsetDec/24*100)); read.innerHTML=`<b>${fmtDate(row.date)} de 2026</b><div class="kv"><div>Estación en Chile</div><div>${row.season}</div><div>Salida del sol</div><div>${row.sunrise}</div><div>Puesta del sol</div><div>${row.sunset}</div><div>Duración del día</div><div>${row.daylight}</div><div>Hemisferio con más radiación</div><div>${hemi==='ninguno'?'ninguno (equinoccio)':hemi}</div><div>Latitud de rayos más directos</div><div>${row.declination.toFixed(1)}°</div><div>Motor visual</div><div>WebGL</div></div><div class="sunbar"><div class="mini" style="left:${sr}%;width:${Math.max(0,ss-sr)}%"></div></div><div class="small2" style="display:flex;justify-content:space-between;margin-top:4px"><span>00:00</span><span>salida ${row.sunrise}</span><span>puesta ${row.sunset}</span><span>24:00</span></div><p class="small" style="margin:.65em 0 0">La franja cálida sobre la Tierra marca dónde llegan los rayos más directos. Mover la órbita cambia la estación; mover la rotación cambia día/noche.</p>`;
  }

  drawSystem = render;
  window.__estacionesWebGL = { engine: 'webgl', render };

  canvas.addEventListener('pointerdown', e=>{ const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,near=window.earthScreen&&Math.hypot(x-window.earthScreen.x,y-window.earthScreen.y)<Math.max(70,window.earthScreen.r*1.5); drag={x,y,mode:e.shiftKey?'pan':(near?'earth':'cam'),sd:+dayS.value,sy:yaw,sp:pitch,target:[...target]}; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e=>{ if(!drag)return; const r=canvas.getBoundingClientRect(),x=e.clientX-r.left,y=e.clientY-r.top,dx=x-drag.x,dy=y-drag.y; if(drag.mode==='earth'){ const curr=cycleIndexByDoy[drag.sd]||0, ni=(Math.round(curr+dx*.45)%cycleRows.length+cycleRows.length)%cycleRows.length; dayS.value=cycleRows[ni].doy; } else if(drag.mode==='pan'){ const cam=camera(),scale=dist/700; target=add(drag.target,add(mul(cam.right,-dx*scale),mul(cam.up,dy*scale))); } else { yaw=drag.sy+dx*.008; pitch=Math.max(-1.22,Math.min(1.22,drag.sp+dy*.006)); } redraw(); });
  canvas.addEventListener('pointerup',()=>drag=null); canvas.addEventListener('pointercancel',()=>drag=null); canvas.addEventListener('wheel',e=>{ e.preventDefault(); dist=Math.max(4.2,Math.min(15,dist*(e.deltaY>0?1.08:.92))); redraw(); },{passive:false});
  document.getElementById('top').onclick=()=>{yaw=0;pitch=1.16;target=[0,0,0];redraw();};
  document.getElementById('side').onclick=()=>{yaw=-Math.PI/2;pitch=.08;target=[0,0,0];redraw();};
  document.getElementById('free').onclick=()=>{yaw=-.72;pitch=.36;dist=8;target=[0,0,0];redraw();};
  document.getElementById('radiation').onclick=()=>{yaw=-1.05;pitch=.48;dist=5.4;target=epos(+dayS.value);redraw();};
  document.getElementById('chile').onclick=()=>{dayS.value=172;hourS.value=12;yaw=-.12;pitch=.28;dist=5.2;target=epos(172);redraw();};
  const hint=document.querySelector('.panel p.small'); if(hint) hint.innerHTML='<b>Uso:</b> arrastra el fondo para girar el sistema WebGL. Arrastra cerca de la Tierra para moverla por la órbita. Usa la rueda del mouse para zoom. Mantén <b>Shift</b> y arrastra para desplazar el encuadre.';
  redraw();
})();