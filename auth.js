/* ══════════ AUTH + REDEEM — auth.js ══════════ */
(function(){

const html = `
<div class="overlay" id="authRedeemOverlay" onclick="if(event.target===this)closeAuthRedeem()">
  <div class="sheet" style="max-height:75vh">
    <button class="sheet-close" onclick="closeAuthRedeem()">✕</button>
    <div style="padding:24px 20px">
      <div class="auth-tabs">
        <button class="auth-tab" id="arTabLogin" onclick="setArTab('login')">Sign In</button>
        <button class="auth-tab on" id="arTabRegister" onclick="setArTab('register')">Sign Up</button>
        <button class="auth-tab" id="arTabRedeem" onclick="setArTab('redeem')">👑 VIP</button>
      </div>
      <div id="arAuthPanel">
        <input class="auth-inp" id="arUser" placeholder="Username" maxlength="20" autocomplete="off">
        <input class="auth-inp" id="arPass" type="password" placeholder="Password" maxlength="64">
        <div class="auth-err" id="arAuthErr"></div>
        <button class="watch-btn" id="arAuthBtn" onclick="submitArAuth()">Sign Up</button>
        <p style="text-align:center;font-size:.72rem;color:var(--sub);margin-top:10px">Already have an account? <span style="color:var(--accent);cursor:pointer" onclick="setArTab('login')">Sign In</span></p>
        <button class="wl-btn" id="arLogoutBtn" style="display:none;margin-top:8px" onclick="doArLogout()">Log Out</button>
      </div>
      <div id="arRedeemPanel" style="display:none">
        <div id="arVipActiveBox" style="display:none;font-size:.74rem;color:var(--sub);background:var(--card);border:1px solid var(--border);border-radius:8px;padding:12px;margin-bottom:12px;text-align:left;line-height:1.6"></div>
        <input class="auth-inp" id="arCode" placeholder="Enter VIP code" maxlength="12" oninput="this.value=this.value.toUpperCase()" style="text-align:center;letter-spacing:3px">
        <div class="auth-err" id="arRedeemErr"></div>
        <button class="watch-btn" id="arRedeemBtn" onclick="submitArRedeem()">🔓 Unlock VIP</button>
      </div>
    </div>
  </div>
</div>`;

document.body.insertAdjacentHTML('beforeend', html);

let arMode = 'register';
window.currentUsername = window.currentUsername || null;

const _$ = id => document.getElementById(id);
const _lsGet = (k, def=null) => { try{ const v=localStorage.getItem('afx_'+k); return v===null?def:JSON.parse(v); }catch{ return def; } };
const _lsSet = (k, v) => { try{ localStorage.setItem('afx_'+k, JSON.stringify(v)); }catch{} };
const API = window.API_BASE || 'https://aethoflix.vercel.app';

window.openAuthRedeem = function(mode){
  arMode = mode || 'register';
  _$('authRedeemOverlay').classList.add('on');
  document.body.style.overflow = 'hidden';
  setArTab(arMode);
};
window.closeAuthRedeem = function(){
  _$('authRedeemOverlay').classList.remove('on');
  document.body.style.overflow = '';
};

window.openAuth = () => window.openAuthRedeem('login');
window.openVipGate = () => window.openAuthRedeem('redeem');

window.setArTab = function(mode){
  arMode = mode;
  _$('arTabLogin').classList.toggle('on', mode==='login');
  _$('arTabRegister').classList.toggle('on', mode==='register');
  _$('arTabRedeem').classList.toggle('on', mode==='redeem');

  if(mode === 'redeem'){
    _$('arAuthPanel').style.display = 'none';
    _$('arRedeemPanel').style.display = 'block';
    loadArRedeemPanel();
  } else {
    _$('arAuthPanel').style.display = 'block';
    _$('arRedeemPanel').style.display = 'none';
    _$('arAuthErr').textContent = '';
    const token = _lsGet('authToken', null);
    if(token && window.currentUsername){
      _$('arUser').style.display = 'none';
      _$('arPass').style.display = 'none';
      _$('arAuthBtn').style.display = 'none';
      _$('arLogoutBtn').style.display = 'block';
    } else {
      _$('arUser').style.display = '';
      _$('arPass').style.display = '';
      _$('arAuthBtn').style.display = '';
      _$('arAuthBtn').textContent = mode==='login' ? 'Sign In' : 'Sign Up';
      _$('arLogoutBtn').style.display = 'none';
    }
  }
};

window.submitArAuth = async function(){
  const username = _$('arUser').value.trim();
  const password = _$('arPass').value;
  const errDiv = _$('arAuthErr');
  errDiv.textContent = '';
  if(!username || !password){ errDiv.textContent = 'Fill all fields'; return; }
  const btn = _$('arAuthBtn');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Loading...';
  try{
    const res = await fetch(`${API}/api/auth`, {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action: arMode, username, password })
    });
    const data = await res.json();
    if(data.success){
      _lsSet('authToken', data.token);
      window.currentUsername = data.username;
      window.closeAuthRedeem();
      window.updateUserBadge?.();
      window.showToast?.(`Welcome @${data.username}!`);
    } else {
      const msgs = { taken:'Username taken', not_found:'Account not found', wrong_password:'Wrong password', invalid_username:'Username: 3-20 chars, lowercase letters/numbers/_ only', weak_password:'Password must be at least 6 characters', missing_fields:'Fill all fields' };
      errDiv.textContent = msgs[data.reason] || data.error || 'Something went wrong';
    }
  } catch(e){
    errDiv.textContent = 'Network error';
  }
  btn.disabled = false;
  btn.textContent = orig;
};

window.doArLogout = function(){
  _lsSet('authToken', null);
  window.currentUsername = null;
  window.closeAuthRedeem();
  window.updateUserBadge?.();
  window.showToast?.('Logged out');
};

function loadArRedeemPanel(){
  const status = _lsGet('vipStatus', null);
  const isVip = status && status.active && (!status.expires || Date.now() < status.expires);
  const activeBox = _$('arVipActiveBox');
  const codeInp = _$('arCode');
  const redeemBtn = _$('arRedeemBtn');
  _$('arRedeemErr').textContent = '';
  if(isVip){
    const expStr = status.expires ? new Date(status.expires).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'}) : 'Never';
    activeBox.innerHTML = `<b style="color:var(--text)">👑 VIP Active</b><br><b>Code:</b> ${status.code}<br><b>Expires:</b> ${expStr}`;
    activeBox.style.display = 'block';
    codeInp.style.display = 'none';
    redeemBtn.style.display = 'none';
  } else {
    activeBox.style.display = 'none';
    codeInp.style.display = '';
    codeInp.value = '';
    redeemBtn.style.display = '';
    setTimeout(() => codeInp.focus(), 200);
  }
}

window.submitArRedeem = async function(){
  const code = _$('arCode').value.trim().toUpperCase();
  const errDiv = _$('arRedeemErr');
  errDiv.textContent = '';
  if(!code){ errDiv.textContent = 'Enter a code'; return; }
  const btn = _$('arRedeemBtn');
  btn.disabled = true;
  const orig = btn.textContent;
  btn.textContent = 'Checking...';
  try{
    const res = await fetch(`${API}/api/vip?check=` + encodeURIComponent(code));
    const data = await res.json();
    if(data.valid){
      const status = { code: data.code, active: true, expires: data.expires, since: Date.now(), type: data.type };
      localStorage.setItem('afx_vipStatus', JSON.stringify(status));
      errDiv.style.color = '#22c55e';
      errDiv.textContent = '✅ VIP Activated!';
      setTimeout(() => { window.closeAuthRedeem(); window.showToast?.('👑 VIP Unlocked!'); }, 1500);
    } else {
      const msgs = { not_found:'Invalid code', revoked:'Code revoked', used:'Code already used', expired:'Code expired' };
      errDiv.textContent = msgs[data.reason] || 'Something went wrong';
    }
  } catch(e){
    errDiv.textContent = 'Network error';
  }
  btn.disabled = false;
  btn.textContent = orig;
};

window.checkVipStatus = function(){
  const status = _lsGet('vipStatus', null);
  let isVip = false;
  if(status && status.active){
    if(status.expires && Date.now() > status.expires){ _lsSet('vipStatus', { active: false }); }
    else { isVip = true; }
  }
  return isVip;
};

window.updateUserBadge = function(){
  const lbl = _$('menuAuthLabel');
  if(!lbl) return;
  lbl.textContent = window.currentUsername ? '@' + window.currentUsername : 'Sign In';
};

window.checkAuthStatus = async function(){
  const token = _lsGet('authToken', null);
  if(!token){ window.updateUserBadge(); return; }
  try{
    const res = await fetch(`${API}/api/auth?verify=` + encodeURIComponent(token));
    const data = await res.json();
    if(data.valid){ window.currentUsername = data.username; }
    else { _lsSet('authToken', null); window.currentUsername = null; }
  } catch{}
  window.updateUserBadge();
};

window.checkVipStatus();
window.checkAuthStatus();
setTimeout(async () => {
  const token = _lsGet('authToken', null);
  if(!token) window.openAuthRedeem('register');
}, 10000);

})();
