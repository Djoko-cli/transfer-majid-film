// Un réglage `obscured` sort du service sans sa valeur, jamais avec.
//
// Le panneau d'administration en avait besoin pour remplir son champ ; il n'en
// a pas besoin pour permettre de le remplacer. La différence compte parce
// qu'une clé de paiement survit à l'application : la relire, c'est pouvoir
// débiter et rembourser depuis ailleurs. L'écraser ne prend rien à personne,
// ça casse les paiements — une panne, pas un vol.
//
// `isSet` est ce qui remplace la valeur à l'écran : sans lui, un champ vide
// veut dire « non posé » autant que « posé mais masqué », et l'administrateur
// ressaisit un secret qui était déjà là.
export function redactObscured<
  T extends { obscured: boolean; value: string | null; defaultValue: string },
>(variable: T): T & { value: string | null; isSet: boolean } {
  const effective = variable.value ?? variable.defaultValue;

  if (!variable.obscured) {
    return { ...variable, value: effective, isSet: !!effective };
  }

  return { ...variable, value: null, isSet: !!variable.value };
}
