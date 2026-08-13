// Bundle entry for PeerJS — WebRTC data channels for versus mode.
// Exposed as one global so index.html needs no module loader and no CDN script tag.
import { Peer } from "peerjs";
globalThis.Peer = Peer;
