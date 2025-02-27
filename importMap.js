
// just some magic:
const url = new URL(document.currentScript.src)
const dir = url.pathname.slice(0, url.pathname.lastIndexOf('/'))
const script = document.createElement('script')
script.type = 'importmap'
script.textContent = JSON.stringify({
  imports: {
    'wrapped-elements': 
      dir+'/submodules/wrapped-elements/wrapped-elements.js',
    'rtc-perfect-negotiator': 
      dir+'/submodules/rtc-perfect-negotiator/RTCPerfectNegotiator.js',
    'tiny-peerserver-client': 
      dir+'/submodules/tiny-peerserver-client/PeerServerSignalingClient.js',
    'tiny-prng': 
      dir+'/submodules/tinyPRNG.js',
    'rpc-bridge': 
      dir+'/submodules/rpc-bridge/rpc-bridge.js',
    '/submodules/rpc-bridge/simple-event-emitter/simple-event-emitter.js': 
      dir+'/submodules/simple-event-emitter/simple-event-emitter.js',
  }
})
document.head.append(script)
