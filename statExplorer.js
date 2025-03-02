
import {e, debug, show, hide, disable, enable} from 'wrapped-elements'

export const ui = {}

export const uiContainer = e.div.class('mainContainer')(
  e.h1('The Guess Experiment'),
  e.h2('Stat explorer'),
  e.p('Not implemented yet...'),
  ui.button_back = e.button('Back to the experiment')
)

// ui.button_back.onclick = () => {

// }
