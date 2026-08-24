import type { Lang, Localized } from './types.js';

/**
 * Every string the interface shows, in every language.
 *
 * A flat record rather than a library: there are two languages and about twenty
 * keys, so an i18n framework would be more machinery than message. Typing
 * MESSAGES as Localized<Record<MessageKey, string>> makes a missing French
 * translation a compile error rather than a blank label.
 */
export type MessageKey =
  | 'loading'
  | 'cannotStart'
  | 'language'
  | 'question'
  | 'points'
  | 'score'
  | 'streak'
  | 'seconds'
  | 'timeUp'
  | 'runOver'
  | 'correctOf'
  | 'bestStreak'
  | 'newHighScore'
  | 'enterName'
  | 'nameLabel'
  | 'saveScore'
  | 'saving'
  | 'couldNotSave'
  | 'retry'
  | 'notAHighScore'
  | 'highScores'
  | 'noScoresYet'
  | 'playAgain'
  | 'whichCapital'
  | 'wordmark'
  | 'surveyEyebrow'
  | 'countries'
  | 'taglineA'
  | 'taglineB'
  | 'taglineSub'
  | 'beginRun'
  | 'identifyMarker'
  | 'survey'
  | 'capitalLocation'
  | 'projection'
  | 'bestScore'
  | 'noBestYet'
  | 'viewScores'
  | 'back'
  | 'answered';

export const MESSAGES: Localized<Record<MessageKey, string>> = {
  en: {
    loading: 'Loading…',
    cannotStart: 'Cannot start',
    language: 'Language',
    question: 'Question',
    points: 'points',
    score: 'Score',
    streak: 'Streak',
    seconds: 's',
    timeUp: 'Time up',
    runOver: 'Run over',
    correctOf: 'correct out of',
    bestStreak: 'best streak',
    newHighScore: 'New high score!',
    enterName: 'You made the top 10. Enter your name:',
    nameLabel: 'Name',
    saveScore: 'Save score',
    saving: 'Saving…',
    couldNotSave: 'Could not save your score',
    retry: 'Try again',
    notAHighScore: 'Not a top 10 score this time.',
    highScores: 'High scores',
    noScoresYet: 'No scores yet.',
    playAgain: 'Play again',
    whichCapital: 'Which city is the capital?',
    wordmark: 'Capitales',
    surveyEyebrow: 'Cartographic survey',
    countries: 'countries',
    taglineA: 'Read the land.',
    taglineB: 'Name the capital.',
    taglineSub: 'One outline. One marker. Four cities.',
    beginRun: 'Begin the survey',
    identifyMarker: 'Identify the marker',
    survey: 'Survey',
    capitalLocation: 'Capital location',
    projection: 'Azimuthal equal-area',
    bestScore: 'Best score',
    noBestYet: 'No survey filed yet',
    viewScores: 'High scores',
    back: 'Back',
    answered: 'answered',
  },
  fr: {
    loading: 'Chargement…',
    cannotStart: 'Démarrage impossible',
    language: 'Langue',
    question: 'Question',
    points: 'points',
    score: 'Score',
    streak: 'Série',
    seconds: 's',
    timeUp: 'Temps écoulé',
    runOver: 'Partie terminée',
    correctOf: 'bonnes réponses sur',
    bestStreak: 'meilleure série',
    newHighScore: 'Nouveau record !',
    enterName: 'Vous entrez dans le top 10. Entrez votre nom :',
    nameLabel: 'Nom',
    saveScore: 'Enregistrer',
    saving: 'Enregistrement…',
    couldNotSave: 'Impossible d’enregistrer votre score',
    retry: 'Réessayer',
    notAHighScore: 'Pas dans le top 10 cette fois.',
    highScores: 'Meilleurs scores',
    noScoresYet: 'Aucun score pour l’instant.',
    playAgain: 'Rejouer',
    whichCapital: 'Quelle ville est la capitale ?',
    wordmark: 'Capitales',
    surveyEyebrow: 'Relevé cartographique',
    countries: 'pays',
    taglineA: 'Lisez le territoire.',
    taglineB: 'Nommez la capitale.',
    taglineSub: 'Une silhouette. Un repère. Quatre villes.',
    beginRun: 'Commencer le relevé',
    identifyMarker: 'Identifiez le repère',
    survey: 'Relevé',
    capitalLocation: 'Emplacement de la capitale',
    projection: 'Projection azimutale équivalente',
    bestScore: 'Meilleur score',
    noBestYet: 'Aucun relevé déposé',
    viewScores: 'Meilleurs scores',
    back: 'Retour',
    answered: 'répondu',
  },
};

/** Looks up one interface string. */
export function t(lang: Lang, key: MessageKey): string {
  return MESSAGES[lang][key];
}

/** Flag shown on the language toggle. */
export const LANG_FLAG: Localized<string> = { en: '🇬🇧', fr: '🇫🇷' };

/** Full language name, shown in the toggle's accessible label. */
export const LANG_NAME: Localized<string> = { en: 'English', fr: 'Français' };
