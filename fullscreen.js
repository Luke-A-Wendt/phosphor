/**
 * Fullscreen navigation with a browser-safe Escape fallback.
 * Native fullscreen is never re-entered without a user gesture. When a browser
 * reserves Escape, one app navigation step remains expanded inside the page;
 * browser UI can return. Leaving the root menu returns to the launch screen.
 */
export class FullscreenController {
  constructor({element,getMode,onBack,onExit,beforeExit,onChange=()=>{},onNotice=()=>{},onResize=()=>{},focusElement,isMobile=()=>false}) {
    this.element=element;
    this.doc=element.ownerDocument;
    this.view=this.doc.defaultView||globalThis;
    this.nav=this.view.navigator||globalThis.navigator;
    this.getMode=getMode;this.onBack=onBack;this.onExit=onExit;this.beforeExit=beforeExit;this.onChange=onChange;
    this.onNotice=onNotice;this.onResize=onResize;this.focusElement=focusElement;
    this.isMobile=typeof isMobile==='function'?isMobile:()=>Boolean(isMobile);
    this.keyboardLocked=false;this.pending=false;
    this._session=0;this._lockAttempt=-1;this._nativeWas=this.native;
    this._expectedExit=false;this._childBackAt=-Infinity;this._exitDelivered=false;
    this._suppressUntil=-Infinity;this._destroyed=false;this._leaving=null;
    this._change=()=>this._fullscreenChanged();
    this.doc.addEventListener('fullscreenchange',this._change);
  }
  get native(){return this.doc.fullscreenElement===this.element;}
  get expanded(){return this.element.classList.contains('immersive');}
  isImmersive(){return this.native||this.expanded;}
  _now(){return this.view.performance?.now?.()??Date.now();}
  _isChild(){return ['game','settings','test'].includes(this.getMode());}
  _completeExit(){
    if(this._exitDelivered)return;
    this._exitDelivered=true;
    this.onExit();
  }
  _refresh(focus=false){
    if(this._destroyed)return;
    this.onChange({native:this.native,expanded:this.expanded,immersive:this.isImmersive(),keyboardLocked:this.keyboardLocked,pending:this.pending});
    const after=()=>{
      if(this._destroyed)return;
      this.onResize();
      // Never move focus out of an open settings dialog.
      if(focus&&!this.doc.querySelector?.('dialog[open]')){
        const target=typeof this.focusElement==='function'?this.focusElement():this.focusElement;
        target?.focus?.({preventScroll:true});
      }
    };
    if(this.view.requestAnimationFrame)this.view.requestAnimationFrame(after);else after();
  }
  _unlock(){
    try{this.nav?.keyboard?.unlock?.();}catch{}
    this.keyboardLocked=false;
  }
  async _requestKeyboardLock(session){
    if(this._lockAttempt===session||!this.native)return;
    this._lockAttempt=session;
    // Chromium's separate API complements the standardized fullscreen option.
    // Unknown fullscreen dictionary members are ignored by older browsers.
    if(!this.nav?.keyboard?.lock)return;
    try{
      await this.nav.keyboard.lock(['Escape']);
      if(this._destroyed||!this.native){this._unlock();return;}
      // A permission prompt from an older session can resolve after another
      // fullscreen entry. Do not unlock or overwrite the newer session.
      if(session!==this._session)return;
      this.keyboardLocked=true;
    }catch{if(session!==this._session)return;this.keyboardLocked=false;}
    this._refresh();
  }
  async toggle(){
    if(this.pending)return;
    if(this.isImmersive())return this.leave();
    return this.enter();
  }
  async enter(){
    if(this.pending||this.isImmersive())return;
    const session=++this._session;
    // A forced browser exit may expose Home while an old animation is pending.
    // A new entry supersedes that exit rather than letting it close this session.
    this._leaving=null;
    this.pending=true;this._expectedExit=false;this._childBackAt=-Infinity;this._exitDelivered=false;
    this._suppressUntil=-Infinity;this.onNotice('');
    try{
      if(!this.element.requestFullscreen)throw new Error('Fullscreen unavailable');
      await this.element.requestFullscreen({navigationUI:'hide',keyboardLock:'browser'});
      if(session!==this._session||this._destroyed)return;
      // Events may arrive before or after the request promise. The attempt is
      // idempotent for this session, so neither ordering prompts twice.
      this._nativeWas=this.native;
      if(this.native){
        void this._requestKeyboardLock(session);
        if(this.isMobile()){
          try{await this.view.screen?.orientation?.lock?.('landscape');}catch{}
        }
      }
    }catch{
      if(session===this._session&&!this._destroyed){
        this.element.classList.add('immersive');
        this.onNotice('Expanded view. This browser or embedded viewer cannot hide its browser controls. Open the site in your browser for native fullscreen.');
      }
    }finally{
      if(session===this._session){this.pending=false;this._refresh(true);}
    }
  }
  leave(){
    if(this._leaving)return this._leaving;
    const operation=this._leave();
    this._leaving=operation;
    const clear=()=>{if(this._leaving===operation)this._leaving=null;};
    operation.then(clear,clear);
    return operation;
  }
  async _leave(){
    const session=++this._session;
    this.pending=false;this._childBackAt=-Infinity;
    this._suppressUntil=-Infinity;this._expectedExit=this.native;
    // Keep native/expanded presentation intact while the CRT powers down.
    // Without a hook, onExit retains its existing synchronous delivery timing.
    if(this.beforeExit){
      try{await this.beforeExit();}catch{}
      if(session!==this._session||this._destroyed)return;
    }
    this._unlock();this.element.classList.remove('immersive');
    try{this.view.screen?.orientation?.unlock?.();}catch{}
    // Deliver exactly once even when fullscreenchange precedes the exit promise.
    this._completeExit();
    try{
      if(this.native)await this.doc.exitFullscreen();
      this.onNotice('');
    }catch{
      this._expectedExit=false;
      this.onNotice('The browser kept fullscreen open. Use its fullscreen exit control to leave.');
    }
    this._refresh(true);
  }
  async escape(event){
    if(event?.repeat)return;
    // Some browsers deliver the reserved Escape key AFTER fullscreenchange.
    // Consume that same key, rather than interpreting it as the second Escape.
    if(this.expanded&&this._now()<this._suppressUntil)return;
    if(this._isChild()){
      this._childBackAt=this.native?this._now():-Infinity;
      this.onBack();this._refresh(true);return;
    }
    if(this.getMode()==='menu')await this.leave();
  }
  _fullscreenChanged(){
    const active=this.native,wasNative=this._nativeWas;
    this._nativeWas=active;
    if(active){
      // A request can finish after the user has already left its pending entry.
      // Exit that late fullscreen result instead of reopening the launch screen.
      if(this._exitDelivered&&this.getMode()==='home'){
        this._expectedExit=true;
        void this.doc.exitFullscreen().catch(()=>this.onNotice('Use your browser fullscreen exit control to leave.'));
        return;
      }
      this.element.classList.remove('immersive');
      if(!this._leaving)void this._requestKeyboardLock(this._session);
    }else if(wasNative){
      this._unlock();
      const alreadyWentBack=this._now()-this._childBackAt<400;
      if(!this._expectedExit&&(alreadyWentBack||this._isChild())){
        this.element.classList.add('immersive');
        if(!alreadyWentBack)this.onBack();
        this._childBackAt=-Infinity;
        // When keydown ran first it has already been consumed; a new key is
        // valid immediately. Otherwise swallow a trailing copy of this key.
        this._suppressUntil=alreadyWentBack?-Infinity:this._now()+160;
        this.onNotice('Your browser reserved Escape. The previous screen stays expanded; Escape goes back again. Browser controls may be visible.');
      }else{
        this.element.classList.remove('immersive');
        this._completeExit();
      }
      this._expectedExit=false;
    }
    this._refresh(true);
  }
  destroy(){
    this._destroyed=true;++this._session;
    this.doc.removeEventListener('fullscreenchange',this._change);this._unlock();
  }
}
