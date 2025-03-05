
import {PRNG} from 'tiny-prng'
import {RPCBridge} from 'rpc-bridge'
import * as peerConnection from './peerConnection.js'
import {e, parallel, log, pageSetup, show, hide, disable, enable} from 'wrapped-elements'

navigator.serviceWorker.register('service-worker.js')

await pageSetup({
  allowDarkTheme: false, // skip the style injection for this
  stylesheets: 'style.css',
  stylesheetsAsLinks: true
})

const ui = {}

document.body.append(
  ui.mainContainer = e.div.class('mainContainer')(
    e.h1('The Guess Experiment'),
    ui.description = e.p('Connect to a peer and one of you will try to guess the randomly selected card which is shown on the other screen. This can be done using remote viewing (extra sensory perception) or telepathy. You can even play with yourself by connecting two devices. Version: 0.10.'),
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
    ui.game = e.article.id('ui_game')(
      ui.table = e.div.id('ui_table').set('disabled')(...((cards = []) => {
        for (const variant of ['star','box','waves','cross','circle']) {
          const card = e.div.class('card')(
            e.img.draggable(false).src(`/imgs/zener/${variant}.svg`).alt(variant),
            e.span(variant)
          )
          cards.push(card)
        }
        return cards
      })())
    ),
    ui.stats = e.article.id('ui_stats').hidden(true)(
      e.h2('Statistics'),
      e.p('Not implemented yet...')
      // for current guesser (you or peer)
      // total this session or total all sessions
      // maybe a checkbox to toggle
      // if not a game show your stats
    ),
    e.p('Made by Joakim L. Christiansen.', e.br, 'See the open source ', e.a.add('code at GitHub').href('https://github.com/JoakimCh/the-guess-experiment'), '.')
  )
)
peerConnection.ui.buttonContainer.append(
  ui.c_childMode = e.label.hidden(true)('Child mode:', 
    ui.checkbox_childMode = e.input.type('checkbox').name('childMode')
    .checked(localStorage.getItem('cb_childMode') == 'true')
    .on('change', ({target:cb}) => localStorage.setItem('cb_childMode', cb.checked))()
  ),
  e.label('Show stats:', 
    ui.checkbox_showStats = e.input.type('checkbox').name('showStats')
    .checked(localStorage.getItem('cb_showStats') == 'true')
    .on('change', ({target:cb}) => localStorage.setItem('cb_showStats', cb.checked))()
  ),
  ui.button_statExplorer = e.button('Stat explorer')
)
ui.button_statExplorer.onclick = async () => {
  const statExplorer = await import('./statExplorer.js')
  document.body.replaceChildren(statExplorer.uiContainer)
  statExplorer.ui.button_back.onclick = () => {
    document.body.replaceChildren(ui.mainContainer)
  }
}
ui.checkbox_showStats.onchange = ({target: {checked}}) => {
  checked ? show(ui.stats) : hide(ui.stats)
}
if (ui.checkbox_showStats.checked) {
  show(ui.stats)
}


const cards = document.querySelectorAll('.card') // getElementsByClassName('card')
const prng = new PRNG()
const peerRpc = new RPCBridge()
peerConnection.setRpcBridge(peerRpc)
let wakeLock
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

peerRpc.on('open', async () => {
  try {wakeLock = await navigator.wakeLock?.request()} catch {}
  hide(ui.description)
  show(ui.selectSide)
  if (peerConnection.isDominant) {
    const side = ui.selectSide.elements['side'].value
    peerRpc.emit('peerSide', side)
  }
})
peerRpc.on('close', () => {
  wakeLock?.release()
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
    hide(ui.c_childMode)
    parallel(cards).classList.remove('correct', 'selected', 'showdown')
    peerRpc.off('close', cleanup)
    peerRpc.off('nextRound', cleanup)
  }
  if (side == 'guesser') {
    show(ui.c_childMode)
    hide(ui.table) // hide the cards
    if (ui.checkbox_childMode.checked) {
      viewCards()
    } else {
      container(
        e.p(`A random card is shown to your peer, to score see if you can guess which!`, e.br, `(remote view it or use telepathic abilities)`),
        e.button.add('Make your guess').onclick(viewCards)
      )
    }
    function viewCards() {
      const text = e.span('Guess the card shown on the other screen.')
      container.replaceChildren(text)
      show(ui.table); enable(ui.table)
      let firstGuess = true
      parallel(cards).onclick = ({currentTarget: currentCard}) => {
        parallel(cards).classList.remove('selected')
        currentCard.classList.add('selected')
        if (firstGuess) {firstGuess = false
          text.remove()
          if (ui.checkbox_childMode.checked) {
            submitGuess()
          } else {
            container.add(e.button.add('Submit your guess!').onclick(submitGuess))
          }
        }
      }
    }
    async function submitGuess({currentTarget: button} = {}) {
      button?.remove()
      parallel(cards).onclick = undefined
      const selectedIndex = parallel(cards).classList.contains('selected').indexOf(true)
      const correctIndex = await peerRpc.call('guess', selectedIndex)
      // setTimeout(() => {
        cards[correctIndex].classList.add('correct')
        parallel(cards).classList.add('showdown')
        if (selectedIndex == correctIndex) {
          container.add(e.p(`Correct!`))
        } else {
          container.add(e.p(`Wrong.`))
        }
        setTimeout(() => {
          // now the peer has been given enough time to see the result and we can start the next round
          if (ui.checkbox_childMode.checked) {
            signalNextRound()
          } else {
            container.add(e.button.add('Start next round').onclick(signalNextRound))
          }
        }, ui.checkbox_childMode.checked ? 3000 : 1000)
      // }, 1000)
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
