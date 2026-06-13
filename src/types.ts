export type TripStyle = 'תרבות' | 'טבע' | 'עיר' | 'חוף' | 'הרפתקאות' | 'קולינריה' | 'משפחה';
export type Priority = 'חובה' | 'רוצה' | 'אולי';
export type PlaceType = 'אטרקציה' | 'מסעדה' | 'מוזיאון' | 'שוק' | 'פארק' | 'שכונה' | 'אחר';
export type ExpenseCategory = 'אוכל' | 'תחבורה' | 'כניסות' | 'קניות' | 'לינה' | 'אחר';

export interface Trip {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  style: TripStyle[];
  notes: string;
  documents: Document[];
  places: Place[];
  schedule: DaySchedule[];
  expenses: Expense[];
  journalEntries: JournalEntry[];
  phase: 'before' | 'during' | 'after';
}

export interface Document {
  id: string;
  name: string;
  type: 'passport' | 'flight' | 'hotel' | 'insurance' | 'other';
  notes: string;
  saved: boolean;
}

export interface Place {
  id: string;
  name: string;
  type: PlaceType;
  priority: Priority;
  note: string;
  address?: string;
  duration?: number; // hours
  assignedDay?: number;
}

export interface DaySchedule {
  day: number;
  date: string;
  places: string[]; // place IDs
}

export interface Expense {
  id: string;
  date: string;
  description: string;
  amount: number;
  currency: string;
  category: ExpenseCategory;
  receiptNote?: string;
}

export interface JournalEntry {
  id: string;
  date: string;
  text: string;
  mood: '😊' | '😐' | '😢' | '🤩' | '😴';
  photos: string[]; // base64 or filenames
}
