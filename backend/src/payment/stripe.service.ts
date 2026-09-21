import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from "@nestjs/common";
import * as StripeNamespace from "stripe";
import { ConfigService } from "src/config/config.service";

type StripeConstructor = typeof import("stripe");

// Pas d'esModuleInterop dans ce dépôt, et les deux chargeurs de ce fichier ne
// livrent pas la même chose : compilé en CommonJS, `require("stripe")` rend
// directement le constructeur et `.default` vaut undefined ; lu comme module
// ES par le stripper de node, c'est `.default` qui le porte. Le repli couvre
// les deux. Même piège que backend/src/avatar/avatarImage.ts pour sharp —
// où il s'était déguisé en « ce fichier n'est pas une image ».
const Stripe: StripeConstructor =
  (StripeNamespace as unknown as { default?: StripeConstructor }).default ??
  (StripeNamespace as unknown as StripeConstructor);

@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);

  constructor(private config: ConfigService) {}

  // `config.get()` LÈVE quand la variable n'existe pas — c'est voulu, ça
  // attrape les fautes de frappe. Mais ces trois réglages-là n'existent
  // qu'une fois le seed passé, et le seed tourne au déploiement, après que
  // l'image a démarré : entre les deux, chaque clic sur « Débloquer »
  // remontait une erreur 500 et une trace brute dans le journal, au lieu de
  // dire simplement que le paiement n'est pas configuré. Observé pour de
  // vrai sur cette instance. Une variable absente, c'est une instance qui
  // ne vend pas — la même réponse qu'un interrupteur éteint.
  isConfigured(): boolean {
    try {
      return (
        this.config.get("stripe.enabled") &&
        !!this.config.get("stripe.secretKey")
      );
    } catch {
      return false;
    }
  }

  // Construit à la demande plutôt que mis en cache : la clé peut changer
  // depuis la console, et un client gardé en mémoire continuerait d'utiliser
  // l'ancienne jusqu'au redémarrage.
  client(): import("stripe").Stripe {
    const key = this.config.get("stripe.secretKey");
    if (!key) {
      // Le message d'une HttpException arrive TEL QUEL dans le corps de la
      // réponse — le filtre par défaut de Nest le recopie. Nommer le réglage
      // manquant tendait donc « stripe.secretKey is not set » à n'importe qui
      // appelait le webhook ou /confirm sur une instance sans Stripe, deux
      // routes sans authentification. Le nom va au journal, où il sert
      // l'exploitant ; l'appelant n'apprend rien de notre configuration.
      this.logger.error(
        "stripe.secretKey is not set: refusing to build a Stripe client",
      );
      throw new InternalServerErrorException("payment is not available");
    }
    return new Stripe(key);
  }
}
