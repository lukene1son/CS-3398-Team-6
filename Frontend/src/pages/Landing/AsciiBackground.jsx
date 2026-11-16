// The landing page hero's animated ASCII drawing of students studying.
//
// It's a pre-rendered video: a 10-second loop, 300 frames at 30fps, that ends exactly where
// it starts (public/ascii/art.webm, with art.mp4 for Safari). Playing a video takes almost no
// work in the browser, so it stays smooth on slower devices; drawing the ~20,000 characters
// live every frame did not. The video is the drawing's rows 0–81 (1470×820), so its bottom
// edge is the characters' knees, where the falling characters below start (pages/heroSeam.js).
//
// ref: the <video>, so the rain and the glow below can follow its playback time.
// reducedMotion: show a still frame (the poster) instead of the video.
export default function AsciiBackground({ className, ref, reducedMotion = false }) {
  if (reducedMotion) {
    return <img className={className} src="/ascii/art-poster.jpg" alt="" aria-hidden="true" />;
  }
  return (
    <video
      ref={ref}
      className={className}
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      poster="/ascii/art-poster.jpg"
      disablePictureInPicture
      aria-hidden="true"
    >
      <source src="/ascii/art.webm" type="video/webm" />
      <source src="/ascii/art.mp4" type="video/mp4" />
    </video>
  );
}
