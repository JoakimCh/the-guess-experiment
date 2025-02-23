
import {e, unwrap, parallel, log, debug, pageSetup, show, hide, disable, enable} from 'wrapped-elements'
import {PRNG} from 'tiny-prng'
import {RPCBridge} from 'rpc-bridge'
// import {BinaryTemplate, t} from 'jlc-serializer'
RPCBridge.debug = (...values) => {
  console.debug('RPCBridge', ...values)
}

navigator.serviceWorker.register('service-worker.js')

await pageSetup({
  allowDarkTheme: false, // skip the style injection for this
  stylesheets: 'style.css',
})

// peerConnection.uiContainer can then adopt the stylesheets loaded
const peerConnection = await import('./peerConnection.js')

const ui = {}

document.body.append(
  ui.mainContainer = e.div.id('mainContainer')(
    e.h1('The Guess Experiment'),
    ui.description = e.p('Connect to a peer and one of you will try to guess the randomly selected card which is shown on the other screen. This can be done using remote viewing (extra sensory perception) or telepathy. You can even play with yourself by connecting two devices. Version: 0.9.'),
    peerConnection.uiContainer,
    ui.selectSide = e.form.id('form_selectSide').class('horizontal').hidden(true)(
      ui.sideFieldset = e.fieldset(e.legend('Select side:'),
        e.label('Guesser:',
          e.input.type('radio').name('side').value('guesser')
        ),
        e.label('Viewer:',
          e.input.type('radio').name('side').value('viewer')
        ),
        e.label('Alternate:',
          e.input.type('radio').name('side').value('alternate')
          .checked(true)
        )
      ),
      e.fieldset(e.legend('Ready to start?'),
        e.label('Me:',
          ui.checkbox_ready = e.input.id('checkbox_ready')
          .type('checkbox').name('ready').value('me')()
        ),
        e.label.style({pointerEvents: 'none'})('Peer:',
          ui.checkbox_peerReady = e.input.id('checkbox_peerReady')
          .type('checkbox').name('ready').value('peer')()
        )
      )
    ),
    ui.game = e.div.id('ui_game')(
      ui.table = e.div.id('ui_table').set('disabled')(...((cards = []) => {
        for (const variant of ['star','box','waves','cross','circle']) {
          const card = e.div.class('card')(
            e.img.draggable(false).src(`zener/${variant}.svg`).alt(variant)
          )
          cards.push(card)
        }
        return cards
      })()),
      ui.score = e.div.id('ui_score').class('vertical').hidden(true)(
        ui.text_myScore = e.span('Total score: ', e.span('0 / 0')),
        ui.text_myLast10 = e.span('Last 10 guesses: ', e.span('0 / 0'))
      ),
    ),
    e.p('Made by Joakim L. Christiansen.', e.br, 'See the open source ', e.a.add('code at GitHub').href('https://github.com/JoakimCh/the-guess-experiment'), '.')
  )
)

const cards = document.querySelectorAll('.card') // getElementsByClassName('card')
const prng = new PRNG()
const peerRpc = new RPCBridge()
peerConnection.setRpcBridge(peerRpc)
let lastSide, alternating

ui.sideFieldset.onchange = () => {
  // (radio button events bubbles up to it)
  const side = ui.selectSide.elements['side'].value
  peerRpc.emit('peerSide', side)
}

ui.checkbox_ready.onchange = ({currentTarget: {checked}}) => {
  peerRpc.emit('peerReady', checked)
  checkReady()
}

function checkReady() {
  const ready = ui.checkbox_ready.checked && ui.checkbox_peerReady.checked
  if (!ready || !peerConnection.isDominant) {
    return // not ready or not the deciding side
  }
  let mySide = ui.selectSide.elements['side'].value
  const alternate = (mySide == 'alternate')
  if (alternate) mySide = ['viewer','guesser'][prng.integer(1)]
  const peerSide = (mySide == 'viewer' ? 'guesser' : 'viewer')
  peerRpc.emit('sidesSelected', {side: peerSide, alternate})
  peerRpc.localEmit('sidesSelected', {side: mySide, alternate})
}

peerRpc.on('open', () => {
  hide(ui.description)
  show(ui.selectSide)
  if (peerConnection.isDominant) {
    const side = ui.selectSide.elements['side'].value
    peerRpc.emit('peerSide', side)
  }
})
peerRpc.on('close', () => {
  hide(ui.selectSide)
  show(ui.description, ui.table)
  disable(ui.table)
})

peerRpc.on('peerReady', ready => {
  ui.checkbox_peerReady.checked = ready
  checkReady()
})

peerRpc.on('peerSide', peerSide => {
  let mySide
  switch (peerSide) {
    case 'viewer': mySide = 'guesser'; break
    case 'guesser': mySide = 'viewer'; break
    case 'alternate': mySide = 'alternate'; break
  }
  const radio = ui.selectSide.querySelector(`input[name="side"][value="${mySide}"]`)
  radio.checked = true
})

peerRpc.on('sidesSelected', ({side, alternate}) => {
  ui.checkbox_ready.checked = false
  ui.checkbox_peerReady.checked = false
  lastSide = side
  peerRpc.localEmit('nextRound')
  alternating = alternate
})

function signalNextRound() {
  peerRpc.emit('nextRound')
  peerRpc.localEmit('nextRound')
}

peerRpc.on('nextRound', () => {
  let side = lastSide
  if (alternating) {
    side = (lastSide == 'viewer' ? 'guesser' : 'viewer')
  }
  hide(ui.selectSide)
  // create a container for game specific elements
  const container = e.div.class('vertical')
  // add it after the table showing the cards
  ui.table.after(container.element)
  peerRpc.once('nextRound', cleanup, {first: true})
  peerRpc.once('close', cleanup)
  function cleanup() {
    container.remove()
    parallel(cards).classList.remove('correct', 'selected', 'showdown')
    peerRpc.off('close', cleanup)
    peerRpc.off('nextRound', cleanup)
  }
  if (side == 'guesser') {
    hide(ui.table) // hide the cards
    container(
      e.p(`A random card is shown to your peer, to score see if you can guess which!`, e.br, `(remote view it or use telepathic abilities)`),
      e.button.add('Make your guess').onclick(viewCards)
    )
    function viewCards() {
      container.replaceChildren()
      show(ui.table); enable(ui.table)
      let firstGuess = true
      parallel(cards).onclick = ({currentTarget: currentCard}) => {
        parallel(cards).classList.remove('selected')
        currentCard.classList.add('selected')
        if (firstGuess) {firstGuess = false
          container.add(e.button.add('Submit your guess!').onclick(submitGuess))
        }
      }
    }
    async function submitGuess({currentTarget: button}) {
      button.remove()
      parallel(cards).onclick = undefined
      const selectedIndex = parallel(cards).classList.contains('selected').indexOf(true)
      const correctIndex = await peerRpc.call('guess', selectedIndex)
      setTimeout(() => {
        cards[correctIndex].classList.add('correct')
        parallel(cards).classList.add('showdown')
        if (selectedIndex == correctIndex) {
          container.add(e.p(`Correct!`))
        } else {
          container.add(e.p(`Wrong.`))
        }
        setTimeout(() => {
          // now the peer has been given enough time to see the result and we can start the next round
          container.add(e.button.add('Start next round').onclick(() => signalNextRound()))
        }, 1000)
      }, 1000)
    }
  } else if (side == 'viewer') {
    enable(ui.table) // make cards bright
    container(
      e.p(`This is the card your peer must guess to score.`, e.br, 
      `(either through remote viewing or telepathic ability)`, e.br, 
        `You can help by transmitting it telepathically!`),
    )
    const correctIndex = prng.integer(4)
    cards[correctIndex].classList.add('correct')
    parallel(cards).classList.add('showdown') // hide others
    peerRpc.bind('guess', indexGuessed => {
      peerRpc.unbind('guess') // to throw error if called again
      cards[indexGuessed].classList.add('selected')
      container.replaceChildren()
      if (indexGuessed == correctIndex) {
        container.add(e.p(`Peer guessed correct!`))
      } else {
        container.add(e.p(`Peer guessed wrong.`))
      }
      container.add(e.p(`Waiting for peer to start next round...`))
      return correctIndex
    })
  } else throw Error('lol')
})

class Score {
  id = ''; total = 0; games = 0; last10 = []
  constructor(id) {
    this.id = id
  }
  register(win) {
    this.games ++
    if (win) this.total ++
    last10.push(win)
    if (this.last10.length > 10) {
      this.last10.shift()
    }
  }
}
let score
