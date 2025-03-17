
import {e} from 'wrapped-elements'

export const ui = {}

export const uiContainer = e.div.class('mainContainer')(
  e.h1('The Guess Experiment'),
  e.h2('How to use'),
  e.h3('How to connect to a friend?'),
  e.p('Give your friend your ID and enter his as the peer ID'),
  ui.button_back = e.button('Back to the experiment')
)
