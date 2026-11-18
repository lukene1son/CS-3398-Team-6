import { useState } from "react";

// The Canvas mark: an outer ring of 8 rounded bars with 8 small dots inside it.
function CanvasLogo() {
  const angles = [0, 45, 90, 135, 180, 225, 270, 315];
  return (
    <svg width="26" height="26" viewBox="0 0 40 40" aria-hidden="true">
      {angles.map((a) => (
        <g key={a} transform={`rotate(${a} 20 20)`}>
          <rect x="16.5" y="1" width="7" height="6" rx="3" fill="white" />
          <circle cx="20" cy="11.5" r="2" fill="white" />
        </g>
      ))}
    </svg>
  );
}

// Canvas supplies the course context when the student starts inside a registered course.
export default function CanvasSignInButton() {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <button type="button" className="btn-canvas" onClick={() => setClicked(true)}>
        <CanvasLogo />
        <span>Join with Canvas</span>
      </button>
      {clicked && <p className="canvas-note">To join from Canvas, open the BuddyTech link inside a Canvas course where it has been installed.</p>}
    </>
  );
}
