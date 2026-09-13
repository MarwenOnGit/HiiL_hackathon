// Stand-in for a real-world "bad" supply contract, used by the anomaly-demo
// button on the harden page. Every clause here fails on purpose:
//   Art 2  — "quantite approximative" (vague quantity)
//   Art 3  — "prix pourra etre revise selon le prix du marche" (unilateral reprice)
//   Art 4  — "delai raisonnable" / "les meilleurs delais" (no deadline, no penalty)
//   Art 6  — "qualite convenue entre les parties" (no objective criteria)
//   Art 7  — unilateral termination, zero notice, full exculpation clause
// and the contract as a whole is missing governing law, dispute resolution,
// force majeure and late-payment terms. The agent flags these for real; this
// text is not modified by the analysis at any point.
export const BAD_SUPPLY_CONTRACT = `CONTRAT DE FOURNITURE DE PANNEAUX DE BOIS

Article 1 - Parties
Entre les soussignes: Atelier Trabelsi, menuiserie sise a Tunis, designe ci-apres
"l'Acheteur", et Societe Bois du Nord, designe ci-apres "le Fournisseur".

Article 2 - Objet du contrat
Le Fournisseur s'engage a fournir a l'Acheteur des panneaux de contreplaque de
18mm, en quantite approximative de 40 unites par mois.

Article 3 - Prix
Le prix est fixe a 45 TND par panneau, soit un montant de 1800 TND par commande
mensuelle. Le prix pourra etre revise selon le prix du marche.

Article 4 - Livraison
Le Fournisseur livre les marchandises dans un delai raisonnable a compter de la
reception de la commande. En cas d'empechement, il previendra l'Acheteur dans
les meilleurs delais.

Article 5 - Paiement
L'Acheteur procede au paiement a 30 jours a compter de la livraison, par
virement bancaire.

Article 6 - Qualite
Les marchandises seront conformes a la qualite convenue entre les parties.

Article 7 - Resiliation
Le Fournisseur pourra resilier a tout moment et sans preavis en cas de
difficulte d'approvisionnement. Le Fournisseur ne pourra en aucun cas etre tenu
responsable des consequences d'une rupture de stock.`;