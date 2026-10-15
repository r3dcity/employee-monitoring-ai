/**
 * Minimal WHEP (WebRTC-HTTP Egress Protocol) client for MediaMTX.
 *
 * Sends one SDP offer (after ICE gathering, so no trickle/PATCH requests are needed) and plays
 * the answer's video track in the given <video> element.
 *
 * @returns {Promise<() => void>} a function that closes the connection
 */
export async function playWhep(url, video, { onDisconnect } = {}) {
  const pc = new RTCPeerConnection();
  pc.addTransceiver("video", { direction: "recvonly" });
  pc.ontrack = (event) => {
    video.srcObject = event.streams[0];
  };
  pc.onconnectionstatechange = () => {
    if (["failed", "disconnected"].includes(pc.connectionState)) onDisconnect?.();
  };

  try {
    await pc.setLocalDescription(await pc.createOffer());
    await waitForIceGathering(pc, 2000);

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/sdp" },
      body: pc.localDescription.sdp,
    });
    if (!response.ok) throw new Error(`WHEP request failed (${response.status})`);
    await pc.setRemoteDescription({ type: "answer", sdp: await response.text() });
  } catch (error) {
    pc.close();
    throw error;
  }

  return () => {
    pc.onconnectionstatechange = null;
    pc.close();
    video.srcObject = null;
  };
}

function waitForIceGathering(pc, timeoutMs) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    pc.addEventListener("icegatheringstatechange", () => {
      if (pc.iceGatheringState === "complete") {
        clearTimeout(timer);
        resolve();
      }
    });
  });
}
