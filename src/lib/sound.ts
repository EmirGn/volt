// The rest countdown while the workout screen is open. In the background the notification plays it instead.
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';

let player: AudioPlayer | null = null;

export function playCountdown() {
  try {
    if (!player) {
      // Duck the gym playlist for the bips instead of stopping it, and play with the silent switch on.
      setAudioModeAsync({ playsInSilentMode: true, interruptionMode: 'duckOthers' }).catch(() => {});
      player = createAudioPlayer(require('../../assets/sounds/rest_countdown.wav'));
    }
    player.seekTo(0);
    player.play();
  } catch {
    // A missing sound never gets in the way of logging.
  }
}

export function stopCountdown() {
  try {
    player?.pause();
  } catch {}
}
