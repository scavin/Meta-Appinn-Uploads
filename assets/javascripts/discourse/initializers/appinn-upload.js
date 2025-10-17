import { apiInitializer } from "discourse/lib/api";
import { setupAppinnUploader } from "../lib/appinn-uploader";

export default apiInitializer("0.11.1", (api) => {
  if (document?.body) {
    document.body.dataset.appinnUploader = "plugin";
  }

  setupAppinnUploader(api);
});
