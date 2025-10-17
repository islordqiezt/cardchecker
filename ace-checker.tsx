"use client"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Card, CardContent } from "@/components/ui/card"
import { Eye, EyeOff, Copy, Trash2, Play, Square } from "lucide-react"

interface ResultItem {
  id: string
  content: string
}

export default function Component() {
  const [isRunning, setIsRunning] = useState(false)
  const [cards, setCards] = useState("")
  const [skc, setSkc] = useState("")
  const [tg, setTg] = useState("")
  const [amo, setAmo] = useState("")

  const [stats, setStats] = useState({
    total: 0,
    charged: 0,
    cvv: 0,
    ccn: 0,
    dead: 0,
    tested: 0,
  })

  const [visibleSections, setVisibleSections] = useState({
    charged: false,
    cvv: false,
    ccn: false,
    declined: false,
  })

  const [results, setResults] = useState({
    charged: [] as ResultItem[],
    cvv: [] as ResultItem[],
    ccn: [] as ResultItem[],
    declined: [] as ResultItem[],
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const showToast = (title: string, type: "success" | "error" | "warning" = "success") => {
    // Simple toast implementation - you could replace with a proper toast library
    const toast = document.createElement("div")
    toast.className = `fixed top-4 right-4 z-50 px-4 py-2 rounded shadow-lg text-white ${
      type === "success" ? "bg-green-600" : type === "error" ? "bg-red-600" : "bg-yellow-600"
    }`
    toast.textContent = title
    document.body.appendChild(toast)
    setTimeout(() => {
      document.body.removeChild(toast)
    }, 3000)
  }

  const toggleSection = (section: keyof typeof visibleSections) => {
    setVisibleSections((prev) => ({
      ...prev,
      [section]: !prev[section],
    }))
  }

  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text)
      showToast(`COPIED ${type.toUpperCase()}`, "success")
    } catch (err) {
      // Fallback for older browsers
      const textarea = document.createElement("textarea")
      textarea.value = text
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand("copy")
      document.body.removeChild(textarea)
      showToast(`COPIED ${type.toUpperCase()}`, "success")
    }
  }

  const handleCopy = (section: keyof typeof results) => {
    const text = results[section].map((item) => item.content).join("\n")
    const typeMap = {
      charged: "CHARGED",
      cvv: "CVV",
      ccn: "CCN",
      declined: "DECLINED",
    }
    copyToClipboard(text, typeMap[section])
  }

  const handleTrash = () => {
    setResults((prev) => ({ ...prev, declined: [] }))
    setStats((prev) => ({ ...prev, dead: 0 }))
    showToast("REMOVED DEAD", "error")
  }

  const removeLine = () => {
    const lines = cards.split("\n")
    lines.splice(0, 1)
    setCards(lines.join("\n"))
  }

  const processCard = async (cardData: string, signal: AbortSignal) => {
    try {
      // Call our Next.js API endpoint
      const response = await fetch(
        `/api/check?lista=${encodeURIComponent(cardData)}&skc=${encodeURIComponent(skc)}&tg=${encodeURIComponent(tg)}&amo=${encodeURIComponent(amo)}`,
        {
          signal,
        },
      )

      if (signal.aborted) return

      const result = await response.text()

      const newItem: ResultItem = {
        id: Date.now().toString() + Math.random(),
        content: result,
      }

      if (result.includes("#CHARGED")) {
        setResults((prev) => ({ ...prev, charged: [...prev.charged, newItem] }))
        setStats((prev) => ({ ...prev, charged: prev.charged + 1, tested: prev.tested + 1 }))
        showToast("+1 CHARGED", "success")
      } else if (result.includes("#CVV")) {
        setResults((prev) => ({ ...prev, cvv: [...prev.cvv, newItem] }))
        setStats((prev) => ({ ...prev, cvv: prev.cvv + 1, tested: prev.tested + 1 }))
        showToast("+1 CVV", "success")
      } else if (result.includes("#CCN")) {
        setResults((prev) => ({ ...prev, ccn: [...prev.ccn, newItem] }))
        setStats((prev) => ({ ...prev, ccn: prev.ccn + 1, tested: prev.tested + 1 }))
        showToast("+1 CCN", "success")
      } else if (result.includes("SK_DIE")) {
        showToast("Your SK is DIE", "error")
        handleStop()
        return
      } else if (result.includes("SK_INVALID")) {
        showToast("SK Invalid", "error")
        handleStop()
        return
      } else {
        setResults((prev) => ({ ...prev, declined: [...prev.declined, newItem] }))
        setStats((prev) => ({ ...prev, dead: prev.dead + 1, tested: prev.tested + 1 }))
      }

      removeLine()
    } catch (error) {
      if (!signal.aborted) {
        console.error("Error processing card:", error)
      }
    }
  }

  const handleStart = async () => {
    if (!cards.trim()) {
      showToast("You did not provide a card :(", "error")
      return
    }

    const cardList = cards
      .trim()
      .split("\n")
      .filter((line) => line.trim() !== "")
    const total = cardList.length

    if (total > 10000) {
      showToast("YOU CAN NOT PERFORM THAT ACTION: REDUCE NUMBER OF CARDS TO <10000", "warning")
      return
    }

    // Clean up the cards input
    const cleanedCards = cardList.join("\n")
    setCards(cleanedCards)

    setStats((prev) => ({ ...prev, total }))
    setIsRunning(true)
    showToast("Your cards are being Checked :)", "success")

    // Create abort controller for this session
    abortControllerRef.current = new AbortController()

    // Process cards sequentially to avoid overwhelming the server
    for (let i = 0; i < cardList.length; i++) {
      if (abortControllerRef.current?.signal.aborted) break

      await processCard(cardList[i], abortControllerRef.current.signal)

      // Add small delay between requests
      await new Promise((resolve) => setTimeout(resolve, 100))
    }

    // Check if all cards were processed
    if (!abortControllerRef.current?.signal.aborted) {
      showToast("Completed!!!", "success")
    }

    setIsRunning(false)
  }

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    setIsRunning(false)
    showToast("PAUSED", "warning")
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black to-red-950 text-white font-mono">
      <div className="container mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-medium text-red-500 mb-2">♠</h1>
          <h2 className="text-xl sm:text-2xl lg:text-3xl font-medium text-red-600">ACE CHEXKER</h2>
        </header>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 lg:gap-8">
          {/* Left Column - Input Section */}
          <div className="space-y-6">
            <Card className="bg-zinc-900 border-red-800 shadow-lg shadow-red-500/20">
              <CardContent className="p-4 sm:p-6 space-y-4">
                <Textarea
                  placeholder="PASTE YOUR CARDS HERE"
                  rows={8}
                  value={cards}
                  onChange={(e) => setCards(e.target.value)}
                  className="bg-black border-red-800 text-white placeholder:text-gray-400 resize-y text-sm sm:text-base"
                />
                <Textarea
                  placeholder="sk_live_xxxxxx"
                  rows={1}
                  value={skc}
                  onChange={(e) => setSkc(e.target.value)}
                  className="bg-black border-red-800 text-white placeholder:text-gray-400 text-sm sm:text-base"
                />
                <Textarea
                  placeholder="Telegram ID"
                  rows={1}
                  value={tg}
                  onChange={(e) => setTg(e.target.value)}
                  className="bg-black border-red-800 text-white placeholder:text-gray-400 text-sm sm:text-base"
                />
                <Textarea
                  placeholder="Custom Amount"
                  rows={1}
                  value={amo}
                  onChange={(e) => setAmo(e.target.value)}
                  className="bg-black border-red-800 text-white placeholder:text-gray-400 text-sm sm:text-base"
                />

                {/* Control Buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <Button
                    onClick={handleStart}
                    disabled={isRunning}
                    className="flex-1 bg-gradient-to-r from-red-600 to-red-500 hover:from-red-700 hover:to-red-600 text-white font-medium py-3 text-sm sm:text-base disabled:opacity-50"
                  >
                    <Play className="w-4 h-4 mr-2" />
                    START
                  </Button>
                  <Button
                    onClick={handleStop}
                    disabled={!isRunning}
                    variant="outline"
                    className="flex-1 bg-gray-700 border-gray-600 hover:bg-red-600 hover:border-red-500 text-white font-medium py-3 text-sm sm:text-base disabled:opacity-50"
                  >
                    <Square className="w-4 h-4 mr-2" />
                    STOP
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Stats and Results */}
          <div className="space-y-6">
            {/* Stats Card */}
            <Card className="bg-zinc-900 border-red-800 shadow-lg shadow-red-500/20">
              <CardContent className="p-4 sm:p-6">
                <div className="space-y-3">
                  <div className="flex justify-between items-center text-base sm:text-lg">
                    <span className="text-red-600 font-medium">TOTAL:</span>
                    <span className="bg-red-900 px-3 py-1 rounded text-sm font-bold">{stats.total}</span>
                  </div>
                  <div className="flex justify-between items-center text-base sm:text-lg">
                    <span className="text-red-600 font-medium">CHARGED:</span>
                    <span className="bg-red-900 px-3 py-1 rounded text-sm font-bold">{stats.charged}</span>
                  </div>
                  <div className="flex justify-between items-center text-base sm:text-lg">
                    <span className="text-red-600 font-medium">CVV:</span>
                    <span className="bg-red-900 px-3 py-1 rounded text-sm font-bold">{stats.cvv}</span>
                  </div>
                  <div className="flex justify-between items-center text-base sm:text-lg">
                    <span className="text-red-600 font-medium">CCN:</span>
                    <span className="bg-red-900 px-3 py-1 rounded text-sm font-bold">{stats.ccn}</span>
                  </div>
                  <div className="flex justify-between items-center text-base sm:text-lg">
                    <span className="text-red-600 font-medium">DEAD:</span>
                    <span className="bg-red-900 px-3 py-1 rounded text-sm font-bold">{stats.dead}</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Results Sections */}
            {[
              { title: "CHARGED", key: "charged" as const, icon: Copy },
              { title: "CVV", key: "cvv" as const, icon: Copy },
              { title: "CCN", key: "ccn" as const, icon: Copy },
              { title: "DECLINED", key: "declined" as const, icon: Trash2 },
            ].map(({ title, key, icon: Icon }) => (
              <Card key={key} className="bg-zinc-900 border-red-800 shadow-lg shadow-red-500/20">
                <CardContent className="p-4 sm:p-6">
                  <div className="flex justify-between items-center border-b border-gray-700 pb-3 mb-3">
                    <h4 className="text-base sm:text-lg font-medium text-white">{title}</h4>
                    <div className="flex gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => toggleSection(key)}
                        className="text-white hover:text-red-400 p-2"
                      >
                        {visibleSections[key] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-white hover:text-red-400 p-2"
                        onClick={key === "declined" ? handleTrash : () => handleCopy(key)}
                      >
                        <Icon className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>

                  {visibleSections[key] && (
                    <div className="bg-black border border-gray-700 rounded p-3 max-h-48 overflow-y-auto">
                      {results[key].length > 0 ? (
                        <div className="space-y-1">
                          {results[key].map((item) => (
                            <div key={item.id} className="text-xs sm:text-sm text-gray-300 break-all">
                              {item.content}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-xs sm:text-sm text-gray-400">No results yet...</div>
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
