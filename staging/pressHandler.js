
export class PressHandler {
  #element; #startTime

  onPress; onRelease
  longPressDuration = 800;
  #timer

  /** @param {HTMLElement} element */
  constructor(element) {
    this.#element = element
    this.active(true)
  }

  active(active) {
    const addOrRemove = active ? 'addEventListener' : 'removeEventListener'
    this.#element[addOrRemove]('contextmenu', this.#contextmenu)
    this.#element[addOrRemove]('touchstart', this.#startPress, {passive: true})
    this.#element[addOrRemove]('touchmove', this.#checkTouchPosition, {passive: true})
    this.#element[addOrRemove]('touchend', this.#endPress)
    this.#element[addOrRemove]('touchcancel', this.#endPress)
    this.#startTime = null
  }

  #contextmenu = (event) => {
    event.preventDefault() // prevent it on long press
  }

  #startPress = (event) => {
    this.#startTime = performance.now()
    this.onPress?.({element: this.#element, target: event.target, event})
    if (this.longPressDuration) {
      this.#timer = setTimeout(this.#endPress, this.longPressDuration, event)
    }
  }

  #endPress = (event) => {
    if (this.#startTime === null) return
    clearTimeout(this.#timer)
    const endTime = performance.now()
    const pressDuration = endTime - this.#startTime
    this.#startTime = null
    this.onRelease({
      element: this.#element, target: event.target, pressDuration, 
      longPress: pressDuration >= this.longPressDuration, event
    })
  }

  #checkTouchPosition = (event) => {
    if (this.#startTime === null) return
    const touch = event.touches[0]
    const touchedElement = document.elementFromPoint(touch.clientX, touch.clientY)
    if (touchedElement && !this.#element.contains(touchedElement)) {
      this.#endPress(event)
    }
  }
}
