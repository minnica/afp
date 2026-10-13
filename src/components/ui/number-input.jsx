"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { NumericFormat } from "react-number-format"

// Mantiene el contrato de Input: los formularios reciben el valor sin separadores.
function numberChangeEvent(event, value) {
  const target = new Proxy(event.target, {
    get(input, property) {
      if (property === "value") return value
      if (property === "valueAsNumber") return value === "" ? NaN : Number(value)
      const result = Reflect.get(input, property, input)
      return typeof result === "function" ? result.bind(input) : result
    },
  })
  return new Proxy(event, {
    get(original, property) {
      if (property === "target" || property === "currentTarget") return target
      if (property === "type") return "change"
      const result = Reflect.get(original, property, original)
      return typeof result === "function" ? result.bind(original) : result
    },
  })
}

function numericValidator(value, { min, max, step, required }) {
  const validator = document.createElement("input")
  validator.type = "number"
  if (min !== undefined) validator.min = String(min)
  if (max !== undefined) validator.max = String(max)
  if (step !== undefined) validator.step = String(step)
  validator.required = Boolean(required)
  validator.value = String(value ?? "")
  return validator
}

function NumberInput({
  customInput,
  value,
  defaultValue = "",
  onChange,
  onKeyDown,
  inputMode,
  min,
  max,
  step,
  required,
  disabled,
  readOnly,
  ref,
  ...props
}) {
  const inputRef = useRef(null)
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue)
  const controlled = value !== undefined
  const rawValue = controlled ? value ?? "" : uncontrolledValue
  const numericValue = rawValue === "" ? NaN : Number(rawValue)

  const setInputRef = useCallback((input) => {
    inputRef.current = input
    if (typeof ref === "function") return ref(input)
    if (ref) ref.current = input
  }, [ref])

  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const validator = numericValidator(rawValue, { min, max, step, required })
    const incomplete = rawValue !== "" && validator.value === ""
    input.setCustomValidity(incomplete ? "Ingresa una cantidad válida." : validator.validationMessage)
  }, [rawValue, min, max, step, required])

  function updateValue(nextValue, event) {
    if (!controlled) setUncontrolledValue(nextValue)
    if (event) onChange?.(numberChangeEvent(event, nextValue))
  }

  function handleKeyDown(event) {
    onKeyDown?.(event)
    if (event.defaultPrevented || disabled || readOnly || !["ArrowUp", "ArrowDown"].includes(event.key)) return
    // Conserva el incremento por teclado y las restricciones del input number.
    const validator = numericValidator(rawValue, { min, max, step, required })
    if (step === "any") return
    event.preventDefault()
    if (event.key === "ArrowUp") validator.stepUp()
    else validator.stepDown()
    updateValue(validator.value, event)
  }

  return (
    <NumericFormat
      {...props}
      customInput={customInput}
      getInputRef={setInputRef}
      type="text"
      data-number-input=""
      value={rawValue}
      valueIsNumericString
      thousandSeparator=","
      decimalSeparator="."
      inputMode={inputMode ?? (step !== undefined && step !== "1" && step !== 1 ? "decimal" : "numeric")}
      min={min}
      max={max}
      step={step}
      required={required}
      disabled={disabled}
      readOnly={readOnly}
      role="spinbutton"
      aria-valuenow={Number.isFinite(numericValue) ? numericValue : undefined}
      aria-valuemin={min !== undefined ? Number(min) : undefined}
      aria-valuemax={max !== undefined ? Number(max) : undefined}
      onValueChange={(values, sourceInfo) => {
        if (sourceInfo.source === "event") updateValue(values.value, sourceInfo.event)
      }}
      onKeyDown={handleKeyDown}
    />
  )
}

export { NumberInput }
