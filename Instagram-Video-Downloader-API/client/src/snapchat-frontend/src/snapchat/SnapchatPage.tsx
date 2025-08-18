import React from 'react'
import Downloader from './Downloader'
import Gallery from './Gallery'
import './styles.css'

const SnapchatPage: React.FC = () => {
  return (
    <div className="snap-page">
      <h1>Snapchat Downloader</h1>
      <div className="snap-grid">
        <Downloader />
        <Gallery />
      </div>
    </div>
  )
}

export default SnapchatPage
