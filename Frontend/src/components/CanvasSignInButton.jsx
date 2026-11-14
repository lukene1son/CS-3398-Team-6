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

// Demo "Join with Canvas" button. Same size as the Google and Sign In buttons.
// It doesn't sign in yet; clicking it shows a short note instead.
export default function CanvasSignInButton() {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <button type="button" className="btn-canvas" onClick={() => setClicked(true)}>
        <CanvasLogo />
        <span>Join with Canvas</span>
      </button>
      {clicked && <p className="canvas-note">Canvas sign-in is a demo and isn't connected yet.</p>}
    </>
  );
}
