"use client";
import React, { useState, useEffect } from "react";
import { Upload, Button, Table, message, Modal, Select, Space, Form, Input, Radio, Checkbox } from "antd";
import { UploadOutlined, DownloadOutlined, BarChartOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

type ColumnType = 'date' | 'number' | 'text';

interface ColumnEnum {
  values: Set<string>;
  isNumeric: boolean;
  type: ColumnType;
}

interface ColumnEnums {
  [key: string]: ColumnEnum;
}

interface CustomColumnCondition {
  column: string;
  operator: 'eq' | 'neq' | 'contains' | 'notContains' | 'gt' | 'lt' | 'earliest' | 'latest';
  value: string;
}

interface CustomColumn {
  name: string;
  conditions: CustomColumnCondition[];
  valueColumn: string;
  logic: 'and' | 'or';
}

// 检查是否为日期字符串
const isDateString = (str: string): boolean => {
  // 检查常见的日期格式
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
const formatDateString = (str: string): string => {
  if (/^\d{8}$/.test(str)) {
    // 如果是YYYYMMDD格式，转换为YYYY-MM-DD
    return `${str.slice(0, 4)}-${str.slice(4, 6)}-${str.slice(6, 8)}`;
  }
  return str;
};

// 检查是否为纯数字
const isNumericString = (str: string): boolean => {
  return /^-?\d*\.?\d+$/.test(str);
};

// 判断列类型
const determineColumnType = (values: Set<string>): ColumnType => {
  const valuesArray = Array.from(values);
  
  // 如果所有值都是日期字符串，则为日期类型
  if (valuesArray.every(isDateString)) {
    return 'date';
  }
  
  // 如果所有值都是数字，则为数字类型
  if (valuesArray.every(isNumericString)) {
    return 'number';
  }
  
  // 其他情况为文本类型
  return 'text';
};

const getAllSheetData = (workbook: XLSX.WorkBook, filename: string) => {
  let allData: any[] = [];
  const sheetNames = workbook.SheetNames;
  const singleSheet = sheetNames.length === 1;
  sheetNames.forEach((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
    if (json.length === 0) return; // 跳过空 sheet
    // 过滤注释行（第一列以#开头）
    const columns = Object.keys(json[0] || {});
    const firstCol = columns[0];
    const filtered = json.filter((row: any) => {
      const val = row[firstCol];
      return !(typeof val === 'string' && val.trim().startsWith('#'));
    });
    if (filtered.length === 0) return;
    const sourceValue = singleSheet ? filename : `${filename}-${sheetName}`;
    const withSource = filtered.map((row: any) => ({ ...row, source: sourceValue }));
    allData.push(...withSource);
  });
  return allData;
};

const mergeData = (dataArr: any[][]) => {
  // 获取所有列名
  const allColumns = Array.from(
    new Set(dataArr.flat().reduce((cols, row) => cols.concat(Object.keys(row)), [] as string[]))
  );
  // 合并数据，并为每行加唯一 __rowId
  let rowId = 0;
  const merged = dataArr.flat().map((row: Record<string, any>) => {
    const newRow: Record<string, any> = {};
    allColumns.forEach((col) => {
      newRow[col] = row[col] ?? "";
    });
    newRow.__rowId = `row_${rowId++}`;
    return newRow;
  });
  return { columns: allColumns, data: merged };
};

const updateColumnEnums = (data: any[], columnEnums: ColumnEnums) => {
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
      
      const enumObj = columnEnums[col];
      if (enumObj.values.size < 100) {
        enumObj.values.add(String(value));
        // 如果发现非数字值，更新isNumeric标志
        if (enumObj.isNumeric && isNaN(Number(value))) {
          enumObj.isNumeric = false;
        }
      }
    });
  });

  // 更新每列的类型
  Object.keys(columnEnums).forEach(col => {
    columnEnums[col].type = determineColumnType(columnEnums[col].values);
  });
};

export default function MergeExcelPage() {
  const [tableData, setTableData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [columnEnums, setColumnEnums] = useState<ColumnEnums>({});
  const [modal, contextHolder] = Modal.useModal();
  const [summaryModalVisible, setSummaryModalVisible] = useState(false);
  const [summaryStep, setSummaryStep] = useState(1);
  const [summaryForm] = Form.useForm();
  const [summaryResult, setSummaryResult] = useState<any[]>([]);
  const [summaryColumns, setSummaryColumns] = useState<any[]>([]);

  const handleUpload = async (fileList: File[]) => {
    try {
      const allData: any[][] = [];
      const allHeaders: string[][] = [];
      for (const file of fileList) {
        const data = await file.arrayBuffer();
        let workbook;
        // 判断是否为 csv
        if (file.name.endsWith('.csv')) {
          // 读取 csv
          const text = new TextDecoder('utf-8').decode(data);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          workbook = XLSX.read(data);
        }
        // 先获取所有 sheet 的数据和表头
        const sheetNames = workbook.SheetNames;
        const singleSheet = sheetNames.length === 1;
        sheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (json.length === 0) return;
          // 过滤注释行
          const columns = Object.keys(json[0] || {});
          const firstCol = columns[0];
          const filtered = json.filter((row: any) => {
            const val = row[firstCol];
            return !(typeof val === 'string' && val.trim().startsWith('#'));
          });
          if (filtered.length === 0) return;
          // 记录表头（不含 source 字段）
          allHeaders.push(columns);
        });
        allData.push(getAllSheetData(workbook, file.name));
      }
      // 检查表头一致性（去除 source 字段）
      const headerSet = allHeaders.map(cols => new Set(cols));
      let inconsistent = false;
      let allCols: Set<string> = new Set();
      headerSet.forEach(set => set.forEach(col => allCols.add(col)));
      // 找出所有不一致项
      const diffItems: string[] = [];
      allCols.forEach(col => {
        if (!headerSet.every(set => set.has(col))) {
          diffItems.push(col);
        }
      });
      if (diffItems.length > 0) {
        modal.confirm({
          title: '表头不一致，是否继续合并？',
          content: (
            <div>
              <div>以下列名在部分文件中缺失：</div>
              <ul style={{color: 'red'}}>
                {diffItems.map(col => <li key={col}>{col}</li>)}
              </ul>
            </div>
          ),
          okText: '继续合并',
          cancelText: '取消',
          onOk: () => {
            const { columns, data } = mergeData(allData);
            setColumns(columns.map((col) => ({ title: col, dataIndex: col, key: col })));
            setTableData(data);
            // 更新列枚举
            const newColumnEnums: ColumnEnums = {};
            updateColumnEnums(data, newColumnEnums);
            setColumnEnums(newColumnEnums);
            message.success("Excel/CSV 文件解析并合并成功！");
          },
          onCancel: () => {
            message.info('已取消合并');
          },
        });
        return;
      }
      // 表头一致，直接合并
      const { columns, data } = mergeData(allData);
      setColumns(columns.map((col) => ({ title: col, dataIndex: col, key: col })));
      setTableData(data);
      // 更新列枚举
      const newColumnEnums: ColumnEnums = {};
      updateColumnEnums(data, newColumnEnums);
      setColumnEnums(newColumnEnums);
      message.success("Excel/CSV 文件解析并合并成功！");
    } catch (err) {
      message.error("解析 Excel/CSV 文件失败");
    }
  };

  const handleExport = () => {
    if (!tableData.length) return;
    const ws = XLSX.utils.json_to_sheet(tableData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Merged");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "merged.xlsx");
  };

  const handleSummary = () => {
    setSummaryModalVisible(true);
    setSummaryStep(1);
    summaryForm.resetFields();
  };

  const handleSummaryStep1 = async () => {
    try {
      const values = await summaryForm.validateFields();
      const { groupByColumns, sumColumns, customColumns } = values;
      
      // 预处理：计算每个分组的日期范围
      const groupDateRanges = new Map<string, { [key: string]: { min: number, max: number } }>();
      
      tableData.forEach(row => {
        const groupKey = groupByColumns.map(col => row[col]).join('|');
        if (!groupDateRanges.has(groupKey)) {
          groupDateRanges.set(groupKey, {});
        }
        
        const groupRanges = groupDateRanges.get(groupKey)!;
        
        // 为每个日期列计算范围
        Object.entries(columnEnums).forEach(([col, enumObj]) => {
          if (enumObj.type === 'date' && row[col]) {
            const dateValue = new Date(row[col]).getTime();
            if (!isNaN(dateValue)) {
              if (!groupRanges[col]) {
                groupRanges[col] = { min: dateValue, max: dateValue };
              } else {
                groupRanges[col].min = Math.min(groupRanges[col].min, dateValue);
                groupRanges[col].max = Math.max(groupRanges[col].max, dateValue);
              }
            }
          }
        });
      });
      
      // 处理分组和汇总
      const groupedData = new Map();
      
      tableData.forEach(row => {
        const groupKey = groupByColumns.map(col => row[col]).join('|');
        if (!groupedData.has(groupKey)) {
          groupedData.set(groupKey, {
            ...groupByColumns.reduce((acc, col) => ({ ...acc, [col]: row[col] }), {}),
            ...sumColumns.reduce((acc, col) => ({ ...acc, [col]: 0 }), {}),
            ...customColumns.reduce((acc, col) => ({ ...acc, [col.name]: 0 }), {})
          });
        }
        
        const group = groupedData.get(groupKey);
        
        // 处理普通汇总列
        sumColumns.forEach(col => {
          group[col] += Number(row[col]) || 0;
        });
        
        // 处理自定义列
        customColumns.forEach(customCol => {
          const { name, conditions, valueColumn, logic } = customCol;
          
          // 检查条件
          const conditionResult = conditions.every(condition => {
            const { column, operator, value } = condition;
            const rowValue = String(row[column]);
            const compareValue = String(value);
            
            switch (operator) {
              case 'eq': return rowValue === compareValue;
              case 'neq': return rowValue !== compareValue;
              case 'contains': return rowValue.includes(compareValue);
              case 'notContains': return !rowValue.includes(compareValue);
              case 'gt': return Number(rowValue) > Number(compareValue);
              case 'lt': return Number(rowValue) < Number(compareValue);
              case 'earliest': {
                const columnEnum = columnEnums[column];
                if (columnEnum?.type === 'date') {
                  const groupRanges = groupDateRanges.get(groupKey);
                  return groupRanges && new Date(rowValue).getTime() === groupRanges[column]?.min;
                }
                return false;
              }
              case 'latest': {
                const columnEnum = columnEnums[column];
                if (columnEnum?.type === 'date') {
                  const groupRanges = groupDateRanges.get(groupKey);
                  return groupRanges && new Date(rowValue).getTime() === groupRanges[column]?.max;
                }
                return false;
              }
              default: return false;
            }
          });
          // 如果条件满足，累加值列
          if (logic === 'and' ? conditionResult : conditions.some(condition => {
            const { column, operator, value } = condition;
            const rowValue = String(row[column]);
            const compareValue = String(value);
            
            switch (operator) {
              case 'eq': return rowValue === compareValue;
              case 'neq': return rowValue !== compareValue;
              case 'contains': return rowValue.includes(compareValue);
              case 'notContains': return !rowValue.includes(compareValue);
              case 'gt': return Number(rowValue) > Number(compareValue);
              case 'lt': return Number(rowValue) < Number(compareValue);
              case 'earliest': {
                const columnEnum = columnEnums[column];
                if (columnEnum?.type === 'date') {
                  const groupRanges = groupDateRanges.get(groupKey);
                  return groupRanges && new Date(rowValue).getTime() === groupRanges[column]?.min;
                }
                return false;
              }
              case 'latest': {
                const columnEnum = columnEnums[column];
                if (columnEnum?.type === 'date') {
                  const groupRanges = groupDateRanges.get(groupKey);
                  return groupRanges && new Date(rowValue).getTime() === groupRanges[column]?.max;
                }
                return false;
              }
              default: return false;
            }
          })) {
            group[name] += Number(row[valueColumn]) || 0;
          }
        });
      });
      
      const resultData = Array.from(groupedData.values());
      setSummaryResult(resultData);
      
      // 设置汇总表格的列
      const resultColumns = [
        ...groupByColumns.map(col => ({ title: col, dataIndex: col, key: col })),
        ...sumColumns.map(col => ({ 
          title: `${col} (汇总)`, 
          dataIndex: col, 
          key: col,
          render: (val: number) => val.toFixed(2)
        })),
        ...customColumns.map(col => ({
          title: col.name,
          dataIndex: col.name,
          key: col.name,
          render: (val: number) => val.toFixed(2)
        }))
      ];
      
      setSummaryColumns(resultColumns);
      setSummaryStep(2);
    } catch (error) {
      message.error('请检查输入是否正确');
    }
  };

  const handleExportSummary = () => {
    if (!summaryResult.length) return;
    const ws = XLSX.utils.json_to_sheet(summaryResult);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "summary.xlsx");
  };

  const renderSummaryStep1 = () => (
    <Form form={summaryForm} layout="vertical">
      <Form.Item
        name="groupByColumns"
        label="选择需要汇总的列"
        rules={[{ required: true, message: '请选择至少一个汇总列' }]}
      >
        <Select mode="multiple" placeholder="请选择需要汇总的列">
          {columns.map(col => (
            <Select.Option key={col.dataIndex} value={col.dataIndex}>
              {col.title}
            </Select.Option>
          ))}
        </Select>
      </Form.Item>
      
      <Form.Item
        name="sumColumns"
        label="选择需要计算的数值列"
        rules={[{ required: true, message: '请选择至少一个数值列' }]}
      >
        <Select mode="multiple" placeholder="请选择需要计算的数值列">
          {columns.map(col => {
            const columnEnum = columnEnums[col.dataIndex];
            if (columnEnum?.type === 'number') {
              return (
                <Select.Option key={col.dataIndex} value={col.dataIndex}>
                  {col.title}
                </Select.Option>
              );
            }
            return null;
          })}
        </Select>
      </Form.Item>
      
      <Form.List name="customColumns">
        {(fields, { add, remove }) => (
          <>
            {fields.map(field => (
              <div key={field.key} style={{ border: '1px solid #d9d9d9', padding: 16, marginBottom: 16, borderRadius: 4 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form.Item
                    {...field}
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请输入列名' }]}
                  >
                    <Input placeholder="自定义列名" />
                  </Form.Item>
                  
                  <Form.Item
                    {...field}
                    name={[field.name, 'logic']}
                    rules={[{ required: true, message: '请选择条件逻辑' }]}
                  >
                    <Radio.Group>
                      <Radio value="and">且</Radio>
                      <Radio value="or">或</Radio>
                    </Radio.Group>
                  </Form.Item>
                  
                  <Form.List name={[field.name, 'conditions']}>
                    {(conditionFields, { add: addCondition, remove: removeCondition }) => (
                      <>
                        {conditionFields.map(conditionField => (
                          <Space key={conditionField.key} align="baseline">
                            <Form.Item
                              {...conditionField}
                              name={[conditionField.name, 'column']}
                              rules={[{ required: true, message: '请选择列' }]}
                            >
                              <Select 
                                style={{ width: 120 }} 
                                placeholder="选择列"
                                onChange={(value) => {
                                  // 当列改变时，重置运算符和值
                                  summaryForm.setFieldsValue({
                                    customColumns: {
                                      [field.name]: {
                                        conditions: {
                                          [conditionField.name]: {
                                            operator: undefined,
                                            value: undefined
                                          }
                                        }
                                      }
                                    }
                                  });
                                }}
                              >
                                {columns.map(col => {
                                  const columnEnum = columnEnums[col.dataIndex];
                                  if (columnEnum) {
                                    return (
                                      <Select.Option key={col.dataIndex} value={col.dataIndex}>
                                        {col.title}
                                      </Select.Option>
                                    );
                                  }
                                  return null;
                                })}
                              </Select>
                            </Form.Item>
                            
                            <Form.Item
                              {...conditionField}
                              name={[conditionField.name, 'operator']}
                              rules={[{ required: true, message: '请选择运算符' }]}
                            >
                              <Select 
                                style={{ width: 120 }} 
                                placeholder="选择运算符"
                                onChange={(value) => {
                                  // 当运算符改变时，如果是 earliest 或 latest，清空值
                                  if (value === 'earliest' || value === 'latest') {
                                    summaryForm.setFieldsValue({
                                      customColumns: {
                                        [field.name]: {
                                          conditions: {
                                            [conditionField.name]: {
                                              value: undefined
                                            }
                                          }
                                        }
                                      }
                                    });
                                  }
                                }}
                              >
                                {(() => {
                                  const columnField = summaryForm.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'column']);
                                  const columnEnum = columnField ? columnEnums[columnField] : null;
                                  
                                  const options = [
                                    <Select.Option key="eq" value="eq">等于</Select.Option>,
                                    <Select.Option key="neq" value="neq">不等于</Select.Option>,
                                    <Select.Option key="contains" value="contains">包含</Select.Option>,
                                    <Select.Option key="notContains" value="notContains">不包含</Select.Option>
                                  ];
                                  
                                  if (columnEnum?.type === 'date') {
                                    options.push(
                                      <Select.Option key="earliest" value="earliest">最早日期</Select.Option>,
                                      <Select.Option key="latest" value="latest">最晚日期</Select.Option>
                                    );
                                  }
                                  
                                  if (columnEnum?.type === 'number' || columnEnum?.type === 'date') {
                                    options.push(
                                      <Select.Option key="gt" value="gt">大于</Select.Option>,
                                      <Select.Option key="lt" value="lt">小于</Select.Option>
                                    );
                                  }
                                  
                                  return options;
                                })()}
                              </Select>
                            </Form.Item>
                            
                            <Form.Item
                              {...conditionField}
                              name={[conditionField.name, 'value']}
                              key={conditionField.key}
                              rules={[{ 
                                required: (form) => {
                                  const operator = form.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'operator']);
                                  return operator !== 'earliest' && operator !== 'latest';
                                }, 
                                message: '请选择或输入值' 
                              }]}
                            >
                              <Select
                                style={{ width: 200 }}
                                placeholder="选择或输入值"
                                showSearch
                                allowClear
                                mode="tags"
                                disabled={(() => {
                                  // const columnField = summaryForm.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'column']);
                                  // const operator = summaryForm.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'operator']);
                                  // return operator === 'earliest' || operator === 'latest';
                                })()}
                              >
                                {(() => {
                                  const columnField = summaryForm.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'column']);
                                  const operator = summaryForm.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'operator']);
                                  const columnEnum = columnEnums[columnField];

                                  if (operator === 'earliest' || operator === 'latest') {
                                    return (
                                      <Select.Option key={operator} value={operator}>
                                        {operator === 'earliest' ? '最早日期' : '最晚日期'}
                                      </Select.Option>
                                    );
                                  }
                                  
                                  if (columnField && columnEnums[columnField]) {
                                    return Array.from(columnEnum.values).map(value => {
                                      // 如果是日期类型，格式化显示
                                      if (columnEnum.type === 'date') {
                                        const formattedValue = formatDateString(value);
                                        return (
                                          <Select.Option key={value} value={value}>
                                            {formattedValue}
                                          </Select.Option>
                                        );
                                      }
                                      return (
                                        <Select.Option key={value} value={value}>
                                          {value}
                                        </Select.Option>
                                      );
                                    });
                                  }
                                  return [];
                                })()}
                              </Select>
                            </Form.Item>
                            
                            <Button type="link" onClick={() => removeCondition(conditionField.name)}>
                              删除条件
                            </Button>
                          </Space>
                        ))}
                        <Button type="dashed" onClick={() => addCondition()} block>
                          添加条件
                        </Button>
                      </>
                    )}
                  </Form.List>
                  
                  <Form.Item
                    {...field}
                    name={[field.name, 'valueColumn']}
                    rules={[{ required: true, message: '请选择值列' }]}
                  >
                    <Select placeholder="选择值列">
                      {columns.map(col => {
                        const columnEnum = columnEnums[col.dataIndex];
                        if (columnEnum?.type === 'number') {
                          return (
                            <Select.Option key={col.dataIndex} value={col.dataIndex}>
                              {col.title}
                            </Select.Option>
                          );
                        }
                        return null;
                      })}
                    </Select>
                  </Form.Item>
                  
                  <Button type="link" onClick={() => remove(field.name)}>
                    删除自定义列
                  </Button>
                </Space>
              </div>
            ))}
            <Button type="dashed" onClick={() => add()} block>
              添加自定义列
            </Button>
          </>
        )}
      </Form.List>
    </Form>
  );

  const renderSummaryStep2 = () => (
    <>
      <Table
        columns={summaryColumns}
        dataSource={summaryResult}
        rowKey={(record) => Object.values(record).join('|')}
        scroll={{ x: "max-content" }}
        bordered
      />
      <Button
        type="primary"
        icon={<DownloadOutlined />}
        onClick={handleExportSummary}
        style={{ marginTop: 16 }}
      >
        导出汇总结果
      </Button>
    </>
  );

  return (
    <div style={{ padding: 24 }}>
      <Space>
        <Upload
          multiple
          accept=".xlsx,.xls,.csv"
          beforeUpload={() => false}
          onChange={(info: any) => {
            const files = info.fileList.map((f: any) => f.originFileObj).filter(Boolean) as File[];
            handleUpload(files);
          }}
          showUploadList={true}
        >
          <Button icon={<UploadOutlined />}>上传 Excel/CSV 文件（支持多选）</Button>
        </Upload>
        <Button
          icon={<DownloadOutlined />}
          type="primary"
          onClick={handleExport}
          disabled={!tableData.length}
        >
          导出合并后的 Excel
        </Button>
        <Button
          icon={<BarChartOutlined />}
          type="primary"
          onClick={handleSummary}
          disabled={!tableData.length}
        >
          数据汇总
        </Button>
      </Space>
      
      <Table
        columns={columns}
        dataSource={tableData}
        rowKey="__rowId"
        scroll={{ x: "max-content" }}
        bordered
        style={{ marginTop: 16 }}
      />
      
      <Modal
        title="数据汇总"
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        width={800}
        footer={summaryStep === 1 ? [
          <Button key="back" onClick={() => setSummaryModalVisible(false)}>
            取消
          </Button>,
          <Button key="submit" type="primary" onClick={handleSummaryStep1}>
            下一步
          </Button>
        ] : [
          <Button key="back" onClick={() => setSummaryStep(1)}>
            返回
          </Button>,
          <Button key="close" onClick={() => setSummaryModalVisible(false)}>
            关闭
          </Button>
        ]}
      >
        {summaryStep === 1 ? renderSummaryStep1() : renderSummaryStep2()}
      </Modal>
      
      {contextHolder}
    </div>
  );
}