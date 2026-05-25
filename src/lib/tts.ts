'use client'

let synthesizer: SpeechSynthesis | null = null

function holeSynthesizer(): SpeechSynthesis | null {
  if (typeof window === 'undefined') return null
  if (!('speechSynthesis' in window)) return null
  return (synthesizer ??= window.speechSynthesis)
}

export function spreche(text: string, priorität = false): void {
  const syn = holeSynthesizer()
  if (!syn) return

  if (priorität) syn.cancel()

  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'de-DE'
  utterance.rate = 1.0
  utterance.pitch = 1.0
  utterance.volume = 0.9

  const stimmen = syn.getVoices()
  const deutscheStimme = stimmen.find(v => v.lang.startsWith('de'))
  if (deutscheStimme) utterance.voice = deutscheStimme

  syn.speak(utterance)
}

export function brecheSpracheAb(): void {
  holeSynthesizer()?.cancel()
}
