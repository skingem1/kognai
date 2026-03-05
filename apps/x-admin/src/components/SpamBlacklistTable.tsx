"use client"

import { useState } from "react"
import { format } from "date-fns"
import { Plus, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Label } from "@/components/ui/label"

import type { SpamEntry, SpamType } from "@/types/spam.types"

// Mock data for initial state
const initialSpamEntries: SpamEntry[] = [
  {
    id: "1",
    value: "spammer@example.com",
    type: "email",
    reason: "Bulk spam campaign detected",
    created_at: new Date("2024-01-15T10:30:00Z"),
  },
  {
    id: "2",
    value: "192.168.1.100",
    type: "ip",
    reason: "Malicious traffic from known botnet",
    created_at: new Date("2024-01-20T14:45:00Z"),
  },
  {
    id: "3",
    value: "malicious-domain.net",
    type: "email",
    reason: "Phishing attempts reported",
    created_at: new Date("2024-02-01T09:15:00Z"),
  },
]

// Helper function to generate unique IDs using crypto API
function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  // Fallback for environments without crypto.randomUUID
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// IPv4 validation regex
const IPV4_REGEX = /^(\d{1,3}\.){3}\d{1,3}$/

function isValidEmail(value: string): boolean {
  return EMAIL_REGEX.test(value)
}

function isValidIPv4(value: string): boolean {
  return IPV4_REGEX.test(value)
}

function validateSpamEntry(
  value: string,
  type: SpamType
): { valid: boolean; error?: string } {
  if (!value || value.trim() === "") {
    return { valid: false, error: "Value is required" }
  }

  const trimmedValue = value.trim()

  if (type === "email") {
    if (!isValidEmail(trimmedValue)) {
      return { valid: false, error: "Invalid email format (e.g., user@example.com)" }
    }
  } else if (type === "ip") {
    if (!isValidIPv4(trimmedValue)) {
      return { valid: false, error: "Invalid IPv4 address format (e.g., 192.168.1.1)" }
    }
  }

  return { valid: true }
}

// Helper function to format date with error handling
function formatDate(date: Date | string | undefined): string {
  if (!date) {
    return "N/A"
  }

  try {
    const dateObj = typeof date === "string" ? new Date(date) : date
    if (isNaN(dateObj.getTime())) {
      return "Invalid date"
    }
    return format(dateObj, "MMM dd, yyyy HH:mm")
  } catch {
    return "Invalid date"
  }
}

export function SpamBlacklistTable() {
  const [spamEntries, setSpamEntries] = useState<SpamEntry[]>(initialSpamEntries)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [newEntry, setNewEntry] = useState<{
    type: SpamType
    value: string
    reason: string
  }>({
    type: "email",
    value: "",
    reason: "",
  })
  const [validationError, setValidationError] = useState<string>("")

  const handleAdd = () => {
    // Validate the entry
    const validation = validateSpamEntry(newEntry.value, newEntry.type)

    if (!validation.valid) {
      setValidationError(validation.error || "Invalid input")
      return
    }

    // Check for duplicates
    const isDuplicate = spamEntries.some(
      (entry) =>
        entry.value.toLowerCase() === newEntry.value.trim().toLowerCase() &&
        entry.type === newEntry.type
    )

    if (isDuplicate) {
      setValidationError("This entry already exists in the blacklist")
      return
    }

    const entry: SpamEntry = {
      id: generateId(),
      value: newEntry.value.trim(),
      type: newEntry.type,
      reason: newEntry.reason.trim() || "No reason provided",
      created_at: new Date(),
    }

    setSpamEntries((prev) => [...prev, entry])
    handleDialogClose()
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setNewEntry({
      type: "email",
      value: "",
      reason: "",
    })
    setValidationError("")
  }

  const removeEntry = (id: string) => {
    setSpamEntries((prev) => prev.filter((entry) => entry.id !== id))
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Spam Blacklist</h2>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Add Entry
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add to Blacklist</DialogTitle>
              <DialogDescription>
                Add an email address or IP address to the spam blacklist.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="type">Type</Label>
                <Select
                  value={newEntry.type}
                  onValueChange={(value: SpamType) =>
                    setNewEntry((prev) => ({ ...prev, type: value, value: "" }))
                  }
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="ip">IP Address</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="value">
                  {newEntry.type === "email" ? "Email Address" : "IP Address"}
                </Label>
                <Input
                  id="value"
                  placeholder={
                    newEntry.type === "email"
                      ? "user@example.com"
                      : "192.168.1.1"
                  }
                  value={newEntry.value}
                  onChange={(e) => {
                    setNewEntry((prev) => ({ ...prev, value: e.target.value }))
                    setValidationError("")
                  }}
                  aria-invalid={validationError ? "true" : "false"}
                  aria-describedby={validationError ? "validation-error" : undefined}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reason">Reason</Label>
                <Input
                  id="reason"
                  placeholder="Reason for blocking"
                  value={newEntry.reason}
                  onChange={(e) =>
                    setNewEntry((prev) => ({ ...prev, reason: e.target.value }))
                  }
                />
              </div>
              {validationError && (
                <p
                  id="validation-error"
                  className="text-sm text-red-500"
                  role="alert"
                >
                  {validationError}
                </p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleDialogClose}>
                Cancel
              </Button>
              <Button onClick={handleAdd}>Add to Blacklist</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Value</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Reason</TableHead>
              <TableHead>Created At</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {spamEntries.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center">
                  No entries found. Add a spam entry to get started.
                </TableCell>
              </TableRow>
            ) : (
              spamEntries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="font-medium">{entry.value}</TableCell>
                  <TableCell>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                        entry.type === "email"
                          ? "bg-blue-100 text-blue-800"
                          : "bg-purple-100 text-purple-800"
                      }`}
                    >
                      {entry.type === "email" ? "Email" : "IP"}
                    </span>
                  </TableCell>
                  <TableCell>{entry.reason}</TableCell>
                  <TableCell>{formatDate(entry.created_at)}</TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEntry(entry.id)}
                      aria-label={`Remove ${entry.value} from blacklist`}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}