import {
  mountPitchMotorControls,
  pitchMotorHtml,
  updatePitchMotor,
} from "./panel_fragment.js";

export default {
  id: "pitch_motor",
  title: "俯仰电机 BLD005",

  mount(root) {
    root.innerHTML = pitchMotorHtml();
    mountPitchMotorControls();
  },

  update(snapshot) {
    updatePitchMotor(snapshot);
  },
};
