import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Bunq Bill Splitter',
  description: 'Split bills with voice and photos — powered by Claude + Bunq',
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
