(() => {
  'use strict';

  const PLAYLIST_URL = 'commercials.json';
  const DEFAULT_PHOTO_DURATION = 2000;
  const DEFAULT_FADE_DURATION = 650;

  const player = document.getElementById('commercial-player');
  const stage = document.getElementById('media-stage');
  const startOverlay = document.getElementById('start-overlay');
  const startButton = document.getElementById('start-button');
  const fullscreenButton = document.getElementById('fullscreen-button');
  const playerMessage = document.getElementById('player-message');

  let playlist = [];
  let playlistIndex = 0;
  let photoDuration = DEFAULT_PHOTO_DURATION;
  let fadeDuration = DEFAULT_FADE_DURATION;
  let shouldLoop = true;
  let activeMedia = null;
  let transitionTimer = null;
  let playbackStarted = false;

  function showMessage(message) {
    playerMessage.textContent = message;
    playerMessage.hidden = false;
  }

  function clearMessage() {
    playerMessage.hidden = true;
    playerMessage.textContent = '';
  }

  function wait(milliseconds) {
    return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
  }

  function isVideo(item) {
    if (item.type) return item.type.toLowerCase() === 'video';
    return /\.(mp4|webm|ogg|mov)(\?.*)?$/i.test(item.src || '');
  }

  function createMediaElement(item) {
    if (isVideo(item)) {
      const video = document.createElement('video');
      video.src = item.src;
      video.className = 'commercial-media';
      video.style.transitionDuration = `${fadeDuration}ms`;
      video.preload = 'auto';
      video.playsInline = true;
      video.muted = item.muted === true;
      video.controls = false;
      video.setAttribute('disablepictureinpicture', '');
      video.setAttribute('controlslist', 'nodownload noplaybackrate noremoteplayback');
      return video;
    }

    const image = document.createElement('img');
    image.src = item.src;
    image.alt = item.alt || '';
    image.className = 'commercial-media';
    image.style.transitionDuration = `${fadeDuration}ms`;
    image.decoding = 'async';
    return image;
  }

  function waitForMediaReady(element) {
    return new Promise((resolve, reject) => {
      if (element instanceof HTMLVideoElement) {
        if (element.readyState >= 2) {
          resolve();
          return;
        }
        element.addEventListener('loadeddata', resolve, { once: true });
        element.addEventListener('error', reject, { once: true });
      } else {
        if (element.complete && element.naturalWidth > 0) {
          resolve();
          return;
        }
        element.addEventListener('load', resolve, { once: true });
        element.addEventListener('error', reject, { once: true });
      }
    });
  }

  function preloadNextItem() {
    if (!playlist.length) return;
    const nextIndex = (playlistIndex + 1) % playlist.length;
    const nextItem = playlist[nextIndex];

    if (isVideo(nextItem)) {
      const preloadVideo = document.createElement('video');
      preloadVideo.preload = 'auto';
      preloadVideo.src = nextItem.src;
    } else {
      const preloadImage = new Image();
      preloadImage.src = nextItem.src;
    }
  }

  async function showItem(index) {
    window.clearTimeout(transitionTimer);
    clearMessage();

    const item = playlist[index];
    if (!item || !item.src) {
      advancePlaylist();
      return;
    }

    const newMedia = createMediaElement(item);
    stage.appendChild(newMedia);

    try {
      await waitForMediaReady(newMedia);
    } catch (error) {
      newMedia.remove();
      console.error(`Could not load commercial media: ${item.src}`, error);
      showMessage(`Could not load: ${item.src}`);
      transitionTimer = window.setTimeout(advancePlaylist, 1500);
      return;
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(() => newMedia.classList.add('is-visible'));
    });

    if (activeMedia) {
      activeMedia.classList.remove('is-visible');
      const oldMedia = activeMedia;
      window.setTimeout(() => oldMedia.remove(), fadeDuration + 75);
    }

    activeMedia = newMedia;
    preloadNextItem();

    if (newMedia instanceof HTMLVideoElement) {
      newMedia.addEventListener('ended', advancePlaylist, { once: true });
      newMedia.addEventListener('error', advancePlaylist, { once: true });

      try {
        await newMedia.play();
      } catch (error) {
        // A video with sound may need the initial Start button click.
        startOverlay.hidden = false;
        console.warn('Video autoplay was blocked by the browser.', error);
      }
      return;
    }

    const duration = Number(item.duration) || photoDuration;
    transitionTimer = window.setTimeout(advancePlaylist, Math.max(duration, fadeDuration));
  }

  function advancePlaylist() {
    if (!playlist.length) return;

    const nextIndex = playlistIndex + 1;
    if (nextIndex >= playlist.length && !shouldLoop) {
      return;
    }

    playlistIndex = nextIndex % playlist.length;
    showItem(playlistIndex);
  }

  async function requestFullscreen() {
    if (document.fullscreenElement) return true;

    try {
      await player.requestFullscreen({ navigationUI: 'hide' });
      return true;
    } catch (error) {
      console.info('Fullscreen requires a user click in this browser.', error);
      return false;
    }
  }

  async function beginFromUserGesture() {
    await requestFullscreen();
    startOverlay.hidden = true;

    if (activeMedia instanceof HTMLVideoElement && activeMedia.paused) {
      try {
        await activeMedia.play();
      } catch (error) {
        console.error('Video playback could not begin.', error);
      }
    }
  }

  async function loadPlaylist() {
    try {
      const response = await fetch(PLAYLIST_URL, { cache: 'no-store' });
      if (!response.ok) {
        throw new Error(`Playlist request failed with status ${response.status}`);
      }

      const data = await response.json();
      playlist = Array.isArray(data) ? data : data.media;
      photoDuration = Number(data.photoDuration) || DEFAULT_PHOTO_DURATION;
      fadeDuration = Number(data.fadeDuration) || DEFAULT_FADE_DURATION;
      shouldLoop = data.loop !== false;

      document.documentElement.style.setProperty('--commercial-fade-duration', `${fadeDuration}ms`);
      for (const element of document.querySelectorAll('.commercial-media')) {
        element.style.transitionDuration = `${fadeDuration}ms`;
      }

      if (!Array.isArray(playlist) || playlist.length === 0) {
        throw new Error('The playlist contains no media items.');
      }

      playbackStarted = true;
      showItem(playlistIndex);

      // Most browsers reject this because fullscreen generally requires a user gesture.
      const enteredFullscreen = await requestFullscreen();
      if (!enteredFullscreen) {
        startOverlay.hidden = false;
      }
    } catch (error) {
      console.error(error);
      showMessage('Commercial playlist could not be loaded. Check commercials.json and file paths.');
      startOverlay.hidden = true;
    }
  }

  startButton.addEventListener('click', beginFromUserGesture);
  fullscreenButton.addEventListener('click', requestFullscreen);

  // Any click on the overlay counts as the required browser gesture.
  startOverlay.addEventListener('click', (event) => {
    if (event.target === startOverlay) beginFromUserGesture();
  });

  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.setAttribute(
      'aria-label',
      document.fullscreenElement ? 'Fullscreen active' : 'Enter fullscreen'
    );
  });

  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() === 'f' && !document.fullscreenElement) {
      requestFullscreen();
    }
  });

  if (!playbackStarted) loadPlaylist();
})();
