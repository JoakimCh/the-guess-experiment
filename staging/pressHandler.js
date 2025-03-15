
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
    this.#element[addOrRemove]('touchstart', this.#startPress)
    this.#element[addOrRemove]('touchmove', this.#checkTouchPosition)
    this.#element[addOrRemove]('touchend', this.#endPress)
    this.#element[addOrRemove]('touchcancel', this.#endPress)
    this.#startTime = null
  }

  #startPress = (e) => {
    e.preventDefault()
    this.#startTime = performance.now()
    this.onPress?.(this.#element)
    if (this.longPressDuration) {
      this.#timer = setTimeout(this.#endPress, this.longPressDuration)
    }
  }

  #endPress = (e) => {
    if (this.#startTime === null) return
    clearTimeout(this.#timer)
    const endTime = performance.now()
    const pressDuration = endTime - this.#startTime
    this.#startTime = null
    this.onRelease(this.#element, {
      pressDuration, longPress: pressDuration >= this.longPressDuration
    })
  }

  #checkTouchPosition = (e) => {
    if (this.#startTime === null) return
    const touch = e.touches[0]
    const touchedElement = document.elementFromPoint(touch.clientX, touch.clientY)
    if (touchedElement && !this.#element.contains(touchedElement)) {
      this.#endPress()
    }
  }
}
