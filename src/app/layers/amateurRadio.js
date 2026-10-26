import * as Cesium from 'cesium';
import { createAmateurRadioLayer } from '../../layers/amateurRadio/index.js';
import * as picking from '../../data/pickRegistry.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { governorRequestRender } from '../../renderGovernor.js';
import { createAmateurRadioPanel } from '../../ui/amateurRadioPanel.js';

export function createApplicationAmateurRadio({ source }) {
  const openExternal = (url) =>
    window.open(url, 'gev-amateur-radio-client', 'noopener,noreferrer');
  const player = createAmateurRadioPanel({
    openExternal,
    getActivity: source.getActivity,
  });
  return createAmateurRadioLayer({
    source,
    overlayHost: {
      setEntries: overlays.setOverlayEntries,
      setVisible: overlays.setOverlaySourceVisible,
      clearSource: overlays.clearOverlaySource,
      hitTest: overlays.hitTestWorldOverlay,
    },
    picking,
    pointer: { isPointerFree },
    screenSpaceEventHandlerFactory: (viewer) =>
      new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas),
    openExternal,
    player,
    requestRender: governorRequestRender,
  });
}
