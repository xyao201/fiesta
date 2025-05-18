export type ColumnType = 'date' | 'number' | 'text';

export interface ColumnEnum {
  values: Set<string>;
  isNumeric: boolean;
  type: ColumnType;
}

export interface ColumnEnums {
  [key: string]: ColumnEnum;
}

export interface CustomColumnCondition {
  column: string;
  operator: 'eq' | 'neq' | 'contains' | 'notContains' | 'gt' | 'lt' | 'earliest' | 'latest';
  value: string;
}

export interface CustomColumn {
  name: string;
  conditions: CustomColumnCondition[];
  valueColumn: string;
  logic: 'and' | 'or';
}

export interface SummaryFormValues {
  groupByColumns: string[];
  sumColumns: string[];
  customColumns: CustomColumn[];
} 