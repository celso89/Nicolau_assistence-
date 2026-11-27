let deferredInstallPrompt=null;
const installButtons=()=>[document.getElementById('installAppBtn'),document.getElementById('installAppBtnTop')].filter(Boolean);
function isIOSDevice(){return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream}
function isStandalone(){return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone===true}
function refreshInstallButtons(){
  const installed=isStandalone();
  installButtons().forEach(b=>{b.classList.toggle('hidden',installed);});
}
window.addEventListener('beforeinstallprompt',event=>{
  event.preventDefault(); deferredInstallPrompt=event; refreshInstallButtons();
});
window.addEventListener('appinstalled',()=>{
  deferredInstallPrompt=null; refreshInstallButtons();
});
async function installNicolauApp(){
  if(isStandalone()){alert('A Nicolau Assistance já está instalada neste dispositivo.');return;}
  if(deferredInstallPrompt){
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt=null;
    refreshInstallButtons();
    return;
  }
  if(isIOSDevice()){
    alert('Para instalar no iPhone/iPad: abra este site no Safari, toque em Partilhar e escolha “Adicionar ao ecrã principal”.');
  }else{
    alert('Para instalar: abra o site publicado por HTTPS no Chrome ou Edge. No menu do navegador escolha “Instalar aplicação” ou “Adicionar ao ecrã inicial”. Se a opção não aparecer, atualize a página e volte a tentar.');
  }
}
document.addEventListener('DOMContentLoaded',()=>{
  installButtons().forEach(b=>b.addEventListener('click',installNicolauApp));
  refreshInstallButtons();
  if('serviceWorker' in navigator && (location.protocol==='https:' || location.hostname==='localhost')){
    navigator.serviceWorker.register('./service-worker.js').catch(err=>console.warn('Service Worker:',err));
  }
});
