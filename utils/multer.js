import multer from "multer";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import cloudinary from "./cloudinary.js";

const storage = new CloudinaryStorage({
  cloudinary,
  params: {
    folder: "hospital-saas",
    resource_type: "auto",
    allowed_formats: ["jpg", "jpeg", "png", "webp", "heic", "heif", "pdf"],
  },
});

const upload = multer({
  storage,
  limits: { files: 7 }, // max 7 files
});

export default upload;
