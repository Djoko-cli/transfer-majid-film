import { GetServerSidePropsContext } from "next";

// Redirect to the share page
export function getServerSideProps(context: GetServerSidePropsContext) {
  const { shareId } = context.params!;

  // Toute la chaîne de requête suit, et non plus le seul `recipient`. Une
  // redirection getServerSideProps ne réattache rien d'elle-même : ce qui
  // n'est pas recopié ici est perdu. Stripe renvoie l'acheteur sur
  // `/s/<id>?payment=<session>` — avec la reconstruction champ par champ
  // d'avant, ce paramètre disparaissait en route et la page de retour ne
  // voyait jamais qu'un paiement venait d'aboutir. Recopier la requête
  // entière ferme aussi la porte au prochain paramètre qu'on ajoutera.
  const query = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(context.query)) {
    if (cle === "shareId") continue;
    for (const un of Array.isArray(valeur) ? valeur : [valeur ?? ""])
      query.append(cle, un);
  }

  const chaine = query.toString();

  return {
    props: {},
    redirect: {
      permanent: false,
      destination: `/share/${shareId}${chaine ? `?${chaine}` : ""}`,
    },
  };
}

export default function ShareAlias() {
  return null;
}
