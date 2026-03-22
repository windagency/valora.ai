# Discours de présentation — VALORA
### Guide du présentateur · Français

---

## Diapo 1 — Couverture

*(Laisser la diapo s'afficher, marquer une courte pause.)*

Bonjour à tous, et merci d'être là aujourd'hui.

Ce que vous voyez à l'écran, c'est **VALORA** — un outil que nous avons construit pour changer radicalement la façon dont nos équipes de développement travaillent au quotidien.

En quelques mots : VALORA est une plateforme d'**orchestration d'agents IA** spécialisés. Elle automatise l'ensemble du cycle de vie du développement logiciel — de la rédaction des spécifications jusqu'à la création de la pull request finale.

Pour les plus techniques d'entre vous : c'est une CLI TypeScript, version 2.2.1, disponible sous licence MIT, compatible Node.js 18 et supérieur.

Pour les autres : c'est un chef d'orchestre IA qui coordonne une équipe entière d'experts à votre place, pendant que vous vous concentrez sur ce qui compte vraiment.

Voyons d'abord pourquoi on en a besoin.

---

## Diapo 2 — Citation

*(Lire la citation lentement, en laissant le silence travailler.)*

Je veux commencer par cette phrase, qui est au cœur de la philosophie de VALORA :

> *« L'avenir du développement logiciel n'est pas de remplacer les développeurs, mais d'amplifier leurs capacités avec une collaboration IA intelligente. »*

C'est la promesse de VALORA. Pas un remplacement. Une **amplification**.

Les meilleurs musiciens du monde ont toujours eu un chef d'orchestre. VALORA, c'est ce chef d'orchestre — pour vos équipes de développement.

---

## Diapo 3 — Le Défi du Développement Moderne

Alors, quel est le problème ?

Parlons franchement. Aujourd'hui, développer un logiciel de qualité, c'est difficile. Pas parce que les développeurs manquent de compétences — bien au contraire. C'est difficile parce que l'environnement de travail génère une friction constante, une friction qui s'accumule, qui épuise, et qui ralentit tout le monde.

Voyons concrètement à quoi ça ressemble.

---

## Diapo 4 — Avant / Après

*(Pointer la colonne de gauche, puis la droite.)*

À gauche, le quotidien d'une équipe sans VALORA.

Le développeur **change de contexte** en permanence — un outil pour coder, un autre pour les tests, un autre pour les commits, un autre pour la PR. Chaque transition coûte du temps et de la concentration.

La **documentation** ? Elle se fait quand on a le temps. C'est-à-dire rarement. Et quand elle se fait, elle est incomplète.

Les **revues de code** dépendent de qui est disponible, de leur humeur, de leur niveau de fatigue. La qualité varie énormément.

Et la **pull request** ? Rédiger un bon titre, un bon résumé, lier les tickets, relire une dernière fois — ça prend une heure minimum, parfois plus.

À droite, le même développeur avec VALORA.

Un **workflow unifié** dans une seule commande. La documentation se génère automatiquement à chaque étape. Les revues sont exhaustives, reproductibles, et ne dépendent plus de la disponibilité humaine. La PR se crée en une commande avec tout le contexte déjà structuré.

La différence, c'est pas marginale. C'est structurelle.

---

## Diapo 5 — Qu'est-ce que VALORA ?

Bien. Maintenant que vous voyez le problème, parlons de la solution.

VALORA.

---

## Diapo 6 — L'Acronyme et les 3 Piliers

VALORA, c'est un acronyme :

**V**ersatile **A**gent **L**ogic for **O**rchestrated **R**esponse **A**rchitecture.

En français : une architecture d'agents intelligents, versatile, orchestrée pour produire des réponses adaptées à chaque situation.

Mais au-delà de l'acronyme, ce qui compte, c'est les trois piliers sur lesquels repose la plateforme.

**Premier pilier : une CLI puissante.** Vingt-quatre commandes qui couvrent absolument tout le cycle de vie — de la spec initiale jusqu'au déploiement. Vous n'avez plus besoin de jongler entre dix outils différents.

**Deuxième pilier : onze agents IA spécialisés.** Chaque agent est un expert dans son domaine. Il y a un agent lead pour la supervision, un product manager pour les exigences, un ingénieur sécurité pour la conformité, et ainsi de suite. Je vais vous les présenter dans un instant.

**Troisième pilier : un cycle de vie gouverné en huit phases.** Pas d'étapes sautées, pas de raccourcis dangereux. Chaque projet suit un processus rigoureux avec des points de contrôle qualité à chaque transition.

En chiffres : onze agents, huit phases, vingt-quatre commandes, trois modes d'exécution, quinze serveurs MCP externes. On va tout parcourir.

---

## Diapo 7 — Les Agents Spécialisés

Parlons maintenant des agents.

C'est l'une des innovations les plus importantes de VALORA. Plutôt que d'avoir un seul modèle généraliste qui fait tout — souvent mal — VALORA coordonne des agents spécialisés, chacun entraîné à exceller dans un domaine précis.

---

## Diapo 8 — La Grille des 11 Agents

Voilà les huit agents principaux — il en existe en réalité onze au total, dont des variantes spécialisées.

*(Parcourir la grille en pointant chaque agent.)*

**@lead** — C'est le chef technique. Il supervise l'architecture, génère les plans d'implémentation, conduit les revues de code. C'est l'agent le plus sollicité.

**@product-manager** — Il s'occupe de tout ce qui touche aux exigences : la rédaction des PRD, la décomposition en backlog, la priorisation des tâches.

**@software-engineer** — Les spécialistes de l'implémentation. Il en existe plusieurs variantes — frontend, backend, fullstack — selon la nature de la tâche.

**@platform-engineer** — Infrastructure, CI/CD, DevOps. Il s'assure que ce qui est développé peut être déployé correctement.

**@qa** — L'assurance qualité. Il génère et exécute les tests unitaires, d'intégration, et end-to-end.

**@secops-engineer** — La sécurité. Il audite le code, détecte les vulnérabilités, vérifie la conformité.

**@ui-ux-designer** — Le design et l'accessibilité. Il s'assure que l'interface est cohérente et accessible.

**@asserter** — Le validateur. Il vérifie que l'implémentation correspond bien aux critères d'acceptation définis en amont.

L'idée clé ici : VALORA sélectionne **dynamiquement** le bon agent pour chaque tâche. Vous n'avez pas à y penser. Le moteur décide.

---

## Diapo 9 — Cycle de Vie Complet

Maintenant que vous connaissez les agents, voyons comment ils s'organisent dans le temps.

VALORA structure chaque projet en huit phases séquentielles.

---

## Diapo 10 — Le Pipeline 8 Phases

*(Parcourir le pipeline de gauche à droite.)*

**Phase 1 — Initialisation.** On configure le projet. `valora init`. Simple, rapide.

**Phase 2 — Planification.** Le product manager rédige le PRD, décompose les épics en tâches, priorise le backlog. `valora create-prd`.

**Phase 3 — Collecte de contexte.** L'agent lead analyse le codebase existant — sa structure, ses dépendances, ses conventions — et produit un plan d'implémentation détaillé. `valora plan`.

**Phase 4 — Implémentation.** Les agents software-engineer exécutent les changements de code. C'est là que la magie opère. `valora implement`.

**Phase 5 — Tests.** L'agent QA vérifie que tout fonctionne comme prévu. `valora test`.

**Phase 6 — Révision.** Revue de code, revue fonctionnelle, revue sécurité. Tout est contrôlé avant de livrer. `valora review-code`.

**Phase 7 — Livraison.** Les commits sont rédigés en format conventionnel, la pull request est créée avec tout le contexte nécessaire. `valora create-pr`.

**Phase 8 — Feedback.** On capture ce qui a bien fonctionné et ce qui peut être amélioré. `valora feedback`.

Ce qui est important : **aucune phase ne peut être sautée**. C'est une garantie de qualité. Chaque transition est un point de contrôle.

---

## Diapo 11 — Architecture Technique

Regardons maintenant sous le capot. Comment VALORA est-il construit ?

Pour les profils techniques, cette diapo est faite pour vous. Pour les autres, retenez simplement que le système est modulaire, extensible, et conçu pour ne jamais vous bloquer.

---

## Diapo 12 — L'Architecture 4 Couches

VALORA s'organise en quatre couches distinctes.

*(Pointer chaque couche de haut en bas.)*

**La couche CLI** — c'est l'interface que vous utilisez. Les commandes, l'assistant interactif, le dashboard en temps réel, la sortie formatée. C'est tout ce qui se passe dans votre terminal.

**La couche Orchestrateur** — le cœur du système. Le Pipeline Executor qui séquence les étapes, le Stage Executor qui gère l'exécution de chaque phase, et le Context Manager qui maintient la cohérence entre les appels.

**La couche Agents** — le registre des onze agents, le mécanisme de sélection dynamique, le chargement des prompts spécialisés.

**La couche LLM** — l'accès aux modèles de langage. Anthropic Claude, OpenAI GPT-5, Google Gemini — avec un mécanisme de fallback automatique en trois niveaux. Si un modèle est indisponible, le système bascule automatiquement.

Deux éléments techniques importants : VALORA intègre un **index de symboles AST** — il comprend réellement votre code, pas seulement les fichiers. Et il s'appuie sur le **protocole MCP** pour l'intégration d'outils externes.

---

## Diapo 13 — Modes d'Exécution

Une question revient souvent : est-ce que j'ai besoin d'une clé API pour utiliser VALORA ?

La réponse est non. Et c'est l'un des aspects les plus importants du produit.

VALORA propose trois modes d'exécution, pour s'adapter à chaque situation.

---

## Diapo 14 — Les 3 Tiers

*(Pointer chaque carte de gauche à droite.)*

**Tier 1 — MCP Sampling.** C'est le mode recommandé. Si vous avez un abonnement Cursor, VALORA l'utilise directement. Zéro clé API, zéro configuration, zéro coût supplémentaire. Vous êtes opérationnel en moins de cinq minutes.

**Tier 2 — Complétion Guidée.** Pour ceux qui n'ont pas de clé API mais veulent quand même utiliser VALORA : le système génère des prompts structurés et optimisés, que vous copiez dans n'importe quel assistant IA — Claude, ChatGPT, Gemini. Vous gardez le contrôle total, VALORA s'occupe de la structure.

**Tier 3 — API Directe.** Pour les équipes qui veulent une autonomie totale. VALORA appelle directement les APIs Anthropic, OpenAI ou Google. C'est du pay-per-use, mais c'est la puissance maximale — exécution entièrement autonome, sans intervention humaine.

Le plus beau : les trois modes coexistent. VALORA essaie d'abord le tier 1, bascule sur le tier 2 si besoin, puis sur le tier 3. Vous n'avez jamais de blocage.

---

## Diapo 15 — Optimisation des Modèles

Quand on utilise le mode API, VALORA ne choisit pas le même modèle pour tout. Il optimise.

*(Pointer le tableau.)*

Pour les tâches de **planification et d'analyse profonde** — celles qui nécessitent du raisonnement complexe — VALORA utilise **GPT-5 Thinking**. C'est environ 31% des appels.

Pour **l'implémentation et les revues de code** — des tâches d'exécution précises — **Claude Sonnet**. Encore 31%.

Pour les **validations rapides et les tâches simples** — celles qui ne justifient pas un modèle coûteux — **Claude Haiku**. 38% des appels.

*(Pointer le triangle.)*

Ce triangle illustre l'équilibre que VALORA cherche en permanence : coût, vitesse, qualité. L'allocation stratégique des modèles n'est pas un détail — c'est ce qui rend VALORA économiquement viable à grande échelle.

---

## Diapo 16 — Sécurité Enterprise

Avant de continuer, je veux aborder un sujet qui est souvent la première question dans les organisations plus grandes : la sécurité.

Quand on introduit des agents IA dans un workflow de développement, on introduit aussi des risques nouveaux. VALORA a été conçu avec ces risques en tête, dès la première ligne de code.

---

## Diapo 17 — Les 6 Niveaux de Protection

Six niveaux de protection, tous actifs par défaut.

*(Parcourir les cartes.)*

**Credential Guard** — VALORA ne laisse jamais une variable d'environnement sensible, une clé API, ou un token fuiter dans les sorties ou les logs. La redaction est automatique et systématique.

**Command Guard** — Les agents ne peuvent pas exécuter des commandes dangereuses. L'exfiltration de données, les accès réseau non autorisés, les appels `eval` — tout ça est bloqué.

**Détection d'Injection** — Quand un outil externe renvoie un résultat, VALORA le scanne pour détecter des tentatives d'injection de prompts. Un score de risque est calculé ; si le risque est trop élevé, le résultat est mis en quarantaine.

**Durcissement MCP** — Chaque serveur MCP connecté est validé. Si la définition d'un outil change de façon inattendue — ce qu'on appelle la dérive d'outils — une alerte est déclenchée.

**Chaîne d'approvisionnement** — Le lockfile est gelé. Les scripts d'installation de dépendances sont bloqués. Les overrides de vulnérabilités sont interdits. Votre supply chain est protégée.

**Journalisation d'audit** — Chaque opération est tracée. Chaque événement de sécurité est enregistré. Si quelque chose se passe, vous avez un historique complet pour comprendre ce qui s'est passé.

Ces protections ne sont pas optionnelles. Elles ne se désactivent pas. C'est une décision de conception délibérée.

---

## Diapo 18 — Extensibilité

Maintenant, une question légitime : est-ce que VALORA s'adapte à notre environnement spécifique, à nos conventions, à nos outils ?

La réponse est oui. Et c'est au cœur de l'architecture.

---

## Diapo 19 — Comment Étendre VALORA

*(Pointer la première colonne.)*

VALORA utilise un système de **surcharge par projet**. Quand vous faites `valora init`, un dossier `.valora/` est créé à la racine de votre projet. Tout ce qui s'y trouve prend la priorité sur les valeurs par défaut.

*(Pointer la deuxième colonne.)*

Vous voulez redéfinir l'agent `@lead` pour qu'il soit expert en microservices fintech plutôt qu'en architecture générique ? Créez un fichier `.valora/agents/@lead.md` avec votre propre prompt. VALORA l'utilisera automatiquement.

Même chose pour les commandes, les templates de documents, les prompts de chaque phase.

*(Pointer la troisième colonne.)*

Et si vous avez besoin d'outils externes — Playwright pour les tests navigateur, Figma pour le design, Terraform pour l'infrastructure — VALORA supporte quinze serveurs MCP externes, activables avec approbation utilisateur. Chaque connexion est explicite et traçable.

L'idée directrice : **tout ce que VALORA fait par défaut, vous pouvez le surcharger**. Rien n'est figé.

---

## Diapo 20 — Référence des Commandes

Voici un aperçu rapide des vingt-quatre commandes disponibles, organisées selon les trois phases du cycle de vie.

*(Pointer chaque colonne brièvement.)*

À gauche, la **planification** — de `refine-specs` pour itérer sur les exigences, jusqu'à `review-plan` pour valider le plan avant de coder.

Au centre, l'**implémentation** — `implement` pour exécuter, `assert` pour valider, `test` pour tester, et les deux commandes de revue.

À droite, la **livraison** — `commit` pour des commits propres, `create-pr` pour la PR, et `dash` pour monitorer l'activité en temps réel.

Vous n'avez pas à mémoriser tout ça. VALORA vous guide à chaque étape. Mais il est bon de savoir que la couverture est complète — il n'y a pas de trou dans le workflow.

---

## Diapo 21 — Démarrage Rapide

Concrètement, à quoi ressemble le premier jour avec VALORA ?

*(Pointer chaque ligne du terminal.)*

**Ligne 1** — Une commande pour installer VALORA globalement via pnpm, npm ou yarn.

**Ligne 2** — Vous allez dans votre projet existant, et vous faites `valora init`. En trente secondes, votre projet est configuré.

**Ligne 3** — Vous décrivez ce que vous voulez construire en langage naturel. Ici, "ajouter l'authentification OAuth". VALORA génère un plan d'implémentation détaillé, avec les fichiers à créer, les dépendances à installer, les tests à écrire.

**Ligne 4** — `valora implement`. Les agents exécutent le plan. Vous pouvez regarder, intervenir si vous le souhaitez, ou laisser tourner en arrière-plan.

**Ligne 5** — Une revue automatique du code produit, suivie d'un commit conventionnel généré intelligemment.

**Ligne 6** — La pull request est créée, avec un titre pertinent, un résumé complet, et les liens vers les tickets correspondants.

**Zéro configuration requise** si vous avez un abonnement Cursor. C'est intentionnel — on a voulu que l'expérience de la première minute soit fluide.

---

## Diapo 22 — Conclusion

*(Marquer une pause. Laisser le logo s'afficher.)*

Voilà VALORA.

Je vais résumer en trois points essentiels — les trois raisons pour lesquelles je pense que ça change vraiment la façon de travailler.

**Premièrement** : onze agents spécialisés, coordonnés automatiquement. Le bon expert pour chaque tâche, sans que vous ayez à y penser.

**Deuxièmement** : zéro configuration pour commencer. Si vous avez un abonnement Cursor, vous êtes opérationnel aujourd'hui, maintenant, sans clé API, sans infrastructure supplémentaire.

**Troisièmement** : extensible par conception. VALORA s'adapte à votre environnement, pas l'inverse. Vos conventions, vos outils, vos agents — tout est surchargeable.

*(Pointer la commande d'installation.)*

Si vous voulez essayer : `pnpm add -g @windagency/valora`. Une commande, et vous y êtes.

Je suis disponible pour répondre à vos questions. Et pour ceux qui veulent aller plus loin, la documentation complète est disponible — user guide, developer guide, et les ADR pour comprendre les décisions d'architecture.

Merci.

---

## Notes de présentation

**Durée estimée :** 25 à 35 minutes selon le rythme et les questions intermédiaires.

**Conseil général :** Ne lisez pas les diapos mot à mot — elles sont faites pour soutenir votre discours, pas pour le remplacer. Regardez l'audience, pas l'écran.

**Pour les audiences mixtes :** Les diapos 3-4 (le problème) et 14 (les trois tiers) sont les plus accessibles aux non-techniques — insistez dessus, ralentissez. Les diapos 12 (architecture) et 15 (modèles) sont plus denses — vous pouvez les survoler si le temps manque.

**Transitions à soigner :** Avant chaque diapo divider (3, 5, 7, 9, 11, 13, 16, 18), marquez une pause d'une seconde. Ce sont des respirations dans le récit — laissez-les jouer leur rôle.

**Si on vous demande le prix :** Tier 1 est gratuit avec Cursor. Tier 2 est gratuit. Tier 3 dépend des tarifs Anthropic/OpenAI/Google. VALORA lui-même est open source, licence MIT.

**Si on vous demande par rapport à GitHub Copilot ou Cursor :** VALORA est complémentaire — il orchestre au niveau du workflow complet, là où Copilot opère au niveau de la ligne de code. Les deux coexistent.
