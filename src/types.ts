export type TripStyle = 'תרבות' | 'טבע' | 'עיר' | 'חוף' | 'הרפתקאות' | 'קולינריה' | 'משפחה';
export type Priority = 'חובה' | 'רוצה' | 'אולי';
export type PlaceType = 'אטרקציה' | 'מסעדה' | 'קפה' | 'מוזיאון' | 'שוק' | 'פארק' | 'שכונה' | 'אחר';
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
  flights?: Flight[];
  stays?: Stay[];
  itinerary?: ItineraryItem[];
  dayBases?: Record<string, string>; // date -> base city name
  coverImage?: string;             // URL for hero background image
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
  nameHe: string;
  nameEn?: string;
  city?: string;
  area?: string;
  type: PlaceType;
  must: boolean;
  visited: boolean;
  booked: boolean;
  priceChild?: number;
  priceAdult?: number;
  rating?: number;
  travelTime?: string;
  description?: string;
  website?: string;
  duration?: number;
  imageUrl?: string;  // cached thumbnail from Wikipedia / manual URL
}

export interface DaySchedule {
  day: number;
  date: string;
  places: string[]; // place IDs
}

export type ItemType = 'flight' | 'hotel' | 'car' | 'activity' | 'food' | 'other';
export type ItemStatus = 'planned' | 'paid';
export type MealSlot = 'breakfast' | 'lunch' | 'dinner';

export interface ItineraryItem {
  id: string;
  date: string;
  type: ItemType;
  slot?: MealSlot;
  name: string;
  time?: string;
  cost?: number;
  currency?: string;
  status: ItemStatus;
  address?: string;
  notes?: string;
}

export interface Flight {
  id: string;
  dir: 'out' | 'back';
  flightNo: string;
  from: string;
  to: string;
  date: string;
  dep: string;
  arr: string;
}

export interface Stay {
  id: string;
  name: string;
  checkIn: string;
  checkOut: string;
  cost?: number;
  currency?: string;
  status: ItemStatus;
  address?: string;
  notes?: string;
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
