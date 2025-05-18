import * as XLSX from "xlsx";
import { ColumnType, ColumnEnum, ColumnEnums } from "./types";

// 检查是否为日期字符串
export const isDateString = (str: string): boolean => {
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}$/, // YYYY-MM-DD
    /^\d{4}\/\d{2}\/\d{2}$/, // YYYY/MM/DD
    /^\d{2}-\d{2}-\d{4}$/, // DD-MM-YYYY
    /^\d{2}\/\d{2}\/\d{4}$/, // DD/MM/YYYY
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY-MM-DD HH:mm:ss
    /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/, // YYYY/MM/DD HH:mm:ss
    /^\d{2}-\d{2}-\d{4} \d{2}:\d{2}:\d{2}$/, // DD-MM-YYYY HH:mm:ss
    /^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}$/, // DD/MM/YYYY HH:mm:ss
    /^\d{8}$/, // YYYYMMDD
  ];
  
  return datePatterns.some(pattern => pattern.test(str));
};

// 格式化日期字符串为标准格式
export const formatDateString = (str: string): string => {
  if (/^\d{8}$/.test(str)) {
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  return str;
};

// 检查是否为纯数字
export const isNumericString = (str: string): boolean => {
  // 支持正负号、小数点后两位的数字格式
  return !isNaN(Number(str));
};

// 判断列类型
export const determineColumnType = (values: Set<string>): ColumnType => {
  const valuesArray = Array.from(values);
  
  if (valuesArray.every(isDateString)) {
    return 'date';
  }
  
  if (valuesArray.every(isNumericString)) {
    return 'number';
  }
  
  return 'text';
};

// 获取所有sheet数据
export const getAllSheetData = (workbook: XLSX.WorkBook, filename: string) => {
  let allData: any[] = [];
  const sheetNames = workbook.SheetNames;
  const singleSheet = sheetNames.length === 1;
  
  sheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    
    // 获取所有数据用于检查前后10行
    const allDataPreData = XLSX.utils.sheet_to_json(sheet, { 
      defval: "", 
      header: 1,
      blankrows: false
    });

    // 检查前10行和后10行
    let startRow = 0;
    let endRow = allDataPreData.length;

    // 检查前10行
    for (let i = 0; i < Math.min(10, allDataPreData.length); i++) {
      const row = allDataPreData[i] as any[];
      const isCommentRow = row.some((cell: any) => 
        typeof cell === 'string' && cell.trim().startsWith('#')
      );
      if (isCommentRow) {
        startRow = i + 1;
      } else {
        break;
      }
    }

    // 检查后10行
    for (let i = allDataPreData.length - 1; i >= Math.max(0, allDataPreData.length - 10); i--) {
      const row = allDataPreData[i] as any[];
      const isCommentRow = row.some((cell: any) => 
        typeof cell === 'string' && cell.trim().startsWith('#')
      );
      if (isCommentRow) {
        endRow = i;
      } else {
        break;
      }
    }
    // 使用计算出的起始和结束行获取数据
    const json = XLSX.utils.sheet_to_json(sheet, { 
      defval: "", 
      range: startRow,
      blankrows: false
    }).slice(0, endRow - startRow - 1);
    
    if (json.length === 0) return;
    
    const sourceValue = singleSheet ? filename : `${filename}-${sheetName}`;
    const withSource = json.map((row: any) => ({ ...row, source: sourceValue }));
    allData.push(...withSource);
  });
  
  return allData;
};

// 合并数据
export const mergeData = (dataArr: any[][]) => {
  const allColumns = Array.from(
    new Set(dataArr.flat().reduce((cols: string[], row) => cols.concat(Object.keys(row)), []))
  );
  
  let rowId = 0;
  const merged = dataArr.flat().map((row: Record<string, any>) => {
    const newRow: Record<string, any> = {};
    allColumns.forEach((col: string) => {
      newRow[col] = row[col] ?? "";
    });
    newRow.__rowId = `row_${rowId++}`;
    return newRow;
  });
  
  return { columns: allColumns, data: merged };
};

// 更新列枚举
export const updateColumnEnums = (data: any[], columnEnums: ColumnEnums) => {
  data.forEach(row => {
    Object.entries(row).forEach(([col, value]) => {
      if (col === '__rowId' || col === 'source') return;
      
      if (!columnEnums[col]) {
        columnEnums[col] = {
          values: new Set(),
          isNumeric: !isNaN(Number(value)),
          type: 'text'
        };
      }
      console.log(columnEnums)
      const enumObj = columnEnums[col];
      if (enumObj.values.size < 100) {
        enumObj.values.add(String(value));
        if (enumObj.isNumeric && isNaN(Number(value))) {
          enumObj.isNumeric = false;
        }
      }
    });
  });

  Object.keys(columnEnums).forEach(col => {
    columnEnums[col].type = determineColumnType(columnEnums[col].values);
  });
}; 