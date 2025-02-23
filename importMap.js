
// just some magic:
const url = new URL(document.currentScript.src)
const dir = url.pathname.slice(0, url.pathname.lastIndexOf('/'))
const script = document.createElement('script')
script.type = 'importmap'
script.textContent = JSON.stringify({
  imports: {
    'wrapped-elements': 
      dir+'/wrapped-elements/wrapped-elements.js',
    'rtc-perfect-negotiator': 
      dir+'/rtc-perfect-negotiator/RTCPerfectNegotiator.js',
    'tiny-peerserver-client': 
      dir+'/tiny-peerserver-client/PeerServerSignalingClient.js',
    'tiny-prng': 
      dir+'/tinyPRNG.js',
    'rpc-bridge': 
      dir+'/rpc-bridge/rpc-bridge.js',
    '/rpc-bridge/simple-event-emitter/simple-event-emitter.js': 
      dir+'/simple-event-emitter/simple-event-emitter.js',
  }
})
document.head.append(script)
