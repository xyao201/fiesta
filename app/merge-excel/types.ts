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

export type CalculationType = 'sum' | 'uniqueCount' | 'count' | 'average';

export interface CustomColumn {
  name: string;
  conditions: CustomColumnCondition[];
  valueColumn: string;
  logic: 'and' | 'or';
  calculationType: CalculationType;
}

export interface SummaryColumn {
  column: string;
  calculationType: CalculationType;
}

export interface SummaryFormValues {
  groupByColumns: string[];
  sumColumns: SummaryColumn[];
  customColumns: CustomColumn[];
}

export interface FileData {
  headers: string[];
  data: any[];
} 