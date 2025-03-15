
import {PRNG} from 'tiny-prng'
import {RPCBridge} from 'rpc-bridge'
import * as peerConnection from './peerConnection.js'
import {e, parallel, log, pageSetup, show, hide, disable, enable} from 'wrapped-elements'
import * as scoreDB from './scoreDatabase.js'
import {PressHandler} from './pressHandler.js'
// RPCBridge.debug = console.debug

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
    ui.description = e.p('Connect to a peer and one of you will try to guess the randomly selected card which is shown on the other screen. This can be done using remote viewing (extra sensory perception) or telepathy. You can even play with yourself by connecting two devices.'),
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
          card.dataset.variant = variant
          cards.push(card)
        }
        return cards
      })())
    ),
    ui.stats = e.article.id('ui_stats').hidden(true)(),
    e.p('Made by Joakim L. Christiansen.', e.br, 'See the open source ', e.a.add('code at GitHub').href('https://github.com/JoakimCh/the-guess-experiment'), '.')
  )
)
peerConnection.ui.buttonContainer.append(
  ui.modeSelect = e.select.name('mode').hidden(true)(
    e.option.value('normal')('normal mode'),
    e.option.value('child')('child mode'),
    e.option.value('blind')('blind mode'),
    e.option.value('mixed')('mixed mode'),
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
let statViewer
ui.checkbox_showStats.onchange = async ({target: {checked}}) => {
  checked ? show(ui.stats) : hide(ui.stats)
  if (checked && !statViewer) {
    // yup, we can dynamically load stuff
    statViewer = await import('./stats.js')
    ui.stats.append(...statViewer.uiElements)
    if (lastSide) {
      statViewer.setSide(lastSide)
      statViewer.update()
    }
  }
}
if (ui.checkbox_showStats.checked) {
  ui.checkbox_showStats.onchange({target: {checked: true}})
}

let bigCardsModal, previousMode
ui.modeSelect.onchange = () => {
  const newMode = ui.modeSelect.value
  if (newMode == 'normal') { // switched back to normal
    // log('normal mode')
  } else {
    if (newMode != 'child' && !navigator.maxTouchPoints) {
      ui.modeSelect.value = 'normal'
      return alert(`Your devise does not support touch which is a requirement for this mode.`)
    }
    if (newMode == 'blind' && !voices.length) {
      ui.modeSelect.value = 'normal'
      return alert(`Your browser does not support a speech synthesizer which is a requirement for this mode.`)
    }
    nextButton?.onclick() // if a button should be pushed to continue
    if (newMode != 'child') {
      bigCardsModal = e.div.class('modal')(ui.table)
      document.body.append(bigCardsModal)
      ui.mainContainer.classList.toggle('blur')
      // close it by long pressing the modal background:
      new PressHandler(bigCardsModal).onRelease = ({longPress, target}) => {
        if (!longPress || target != bigCardsModal) return
        ui.modeSelect.value = 'normal' // does not trigger onchange
        bigCardsModal.remove()
        bigCardsModal = null
        ui.game.prepend(ui.table) // send it back
        ui.mainContainer.classList.toggle('blur')
      }
    }
  }
  previousMode = newMode
}

let card_onSelected, card_onBigTouch
const cards = document.querySelectorAll('.card')
// enable(ui.table)
for (const card of cards) {
  card.addEventListener('click', ({currentTarget: card}) => {
    if (ui.modeSelect.value == 'blind') return
    card_onSelected?.(card)
  })
  new PressHandler(card).onRelease = ({element: card, longPress}) => {
    if (ui.modeSelect.value != 'blind') return
    if (longPress) {
      card_onSelected?.(card)
    } else {
      card_onBigTouch?.(card)
    }
  }
}
const prng = new PRNG()
const peerRpc = new RPCBridge()
peerConnection.setRpcBridge(peerRpc)
let wakeLock
let lastSide, alternating
let nextButton
let voices
getVoices().then(result => voices = result)

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

peerRpc.on('sidesSelected', async ({side, alternate}) => {
  hide(ui.selectSide)
  ui.checkbox_ready.checked = false
  ui.checkbox_peerReady.checked = false
  await scoreDB.newSession({
    numCards: 5,
    peer: peerConnection.peerAlias || peerConnection.peerId
  })
  lastSide = side
  alternating = false
  peerRpc.localEmit('nextRound')
  alternating = alternate
})

function signalNextRound() {
  nextButton = null
  peerRpc.emit('nextRound')
  peerRpc.localEmit('nextRound')
}

peerRpc.on('nextRound', () => {
  let side = lastSide
  if (alternating) {
    side = (lastSide == 'viewer' ? 'guesser' : 'viewer')
  }
  statViewer?.setSide(side)
  statViewer?.update()
  lastSide = side
  // create a container for game specific elements
  const container = e.div.class('vertical')
  // ui.table.after(container.element) // add it after the table showing the cards
  ui.game.append(container.element) // add it after the table showing the cards
  peerRpc.once('nextRound', cleanup, {first: true})
  peerRpc.once('close', cleanup)
  function cleanup() {
    container.remove()
    hide(ui.modeSelect)
    parallel(cards).classList.remove('correct', 'selected', 'showdown')
    peerRpc.off('close', cleanup)
    peerRpc.off('nextRound', cleanup)
  }
  if (side == 'guesser') {
    show(ui.modeSelect)
    hide(ui.table) // hide the cards
    if (ui.modeSelect.value != 'normal') {
      viewCards()
      speak('guess the card shown on the other screen')
    } else {
      container(
        e.p(`A random card is shown to your peer, to score see if you can guess which!`, e.br, `(remote view it or use telepathic abilities)`),
        nextButton = e.button.add('Make your guess').onclick(viewCards)
      )
    }
    function viewCards() {
      nextButton = null
      const text = e.p('Guess the card shown on the other screen.')
      container.replaceChildren(text)
      show(ui.table); enable(ui.table)
      let firstGuess = true
      card_onBigTouch = (card) => {
        speak(card.dataset.variant)
      }
      card_onSelected = (currentCard) => {
        parallel(cards).classList.remove('selected')
        currentCard.classList.add('selected')
        if (firstGuess) {firstGuess = false
          text.remove()
          if (ui.modeSelect.value != 'normal') {
            submitGuess()
            speak('guessing '+currentCard.dataset.variant)
          } else {
            container.add(nextButton = e.button.add('Submit your guess!').onclick(submitGuess))
          }
        }
      }
    }
    async function submitGuess({currentTarget: button} = {}) {
      nextButton = null
      button?.remove()
      card_onSelected = undefined
      card_onBigTouch = undefined
      const selectedIndex = parallel(cards).classList.contains('selected').indexOf(true)
      const correctIndex = await peerRpc.call('guess', selectedIndex)
      cards[correctIndex].classList.add('correct')
      parallel(cards).classList.add('showdown')
      if (selectedIndex == correctIndex) {
        scoreDB.saveResult({correct: true, peerGuess: false})
        container.add(e.p(`Correct!`))
        speak(cards[correctIndex].dataset.variant+' is the correct guess')
      } else {
        scoreDB.saveResult({correct: false, peerGuess: false})
        container.add(e.p(`Wrong.`))
        speak(cards[correctIndex].dataset.variant+' is the wrong guess')
      }
      statViewer?.update()
      setTimeout(() => {
        // now the peer has been given enough time to see the result and we can start the next round
        if (ui.modeSelect.value != 'normal') {
          signalNextRound()
        } else {
          container.add(nextButton = e.button.add('Start next round').onclick(signalNextRound))
        }
      }, ui.modeSelect.value != 'normal' ? 3000 : 1000)
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
        scoreDB.saveResult({correct: true, peerGuess: true})
      } else {
        container.add(e.p(`Peer guessed wrong.`))
        scoreDB.saveResult({correct: false, peerGuess: true})
      }
      statViewer?.update()
      container.add(e.p(`Waiting for peer to start next round...`))
      return correctIndex
    })
  } else throw Error('lol')
})

function speak(text) {
  if (ui.modeSelect.value != 'blind') return
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  speechSynthesis.speak(utterance)
}

async function getVoices(timeout = 4000) {
  const start = Date.now()
  while (!speechSynthesis.getVoices().length) {
    if (Date.now() > start + timeout) return []
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  return speechSynthesis.getVoices()
}
