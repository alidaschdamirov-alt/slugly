import { Router, type Request, type Response } from "express";
import { getLinkById, getProductQrById } from "./db";

export const productQrPublicRouter = Router();

productQrPublicRouter.use(async (req: Request, res: Response, next) => {
  try {
    const match = req.path.match(/^\/p\/(\d+)\/01\/(\d{14})(?:\/10\/[^/]+)?(?:\/21\/[^/]+)?\/?$/);
    if (!match) return next();

    const productId = Number(match[1]);
    const gtin = match[2];
    const product = await getProductQrById(productId);
    if (!product || product.gtin !== gtin || product.domainId) {
      return res.status(404).send("Product QR not found");
    }

    const link = await getLinkById(product.linkId);
    if (!link) return res.status(404).send("Product QR link not found");

    const query = req.originalUrl.includes("?")
      ? req.originalUrl.slice(req.originalUrl.indexOf("?"))
      : "";
    return res.redirect(302, `/r/${link.shortCode}${query}`);
  } catch (error) {
    console.error("[ProductQR] Resolver failed:", error);
    return res.status(500).send("Product QR resolver error");
  }
});
