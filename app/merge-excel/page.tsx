"use client";
import React, { useState, useEffect, useRef } from "react";
import { Upload, Button, Table, message, Modal, Space, Form, Spin, Progress } from "antd";
import { UploadOutlined, DownloadOutlined, BarChartOutlined, ReloadOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { ColumnEnums, CustomColumn, CustomColumnCondition, FileData } from "./types";
import { getAllSheetData, mergeData, updateColumnEnums, formatDateString } from "./utils";
import { SummaryForm } from "./components/SummaryForm";
import { SummaryResult } from "./components/SummaryResult";

// 添加分批处理大小常量
const BATCH_SIZE = 1000;

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
  const [cachedSummaryConfig, setCachedSummaryConfig] = useState<{
    groupByColumns: string[];
    sumColumns: string[];
    customColumns: CustomColumn[];
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loadingText, setLoadingText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const uploadTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const processingFilesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (columns.length > 0) {
      const columnKey = columns.map(col => col.dataIndex[0]).join('');
      const savedConfig = localStorage.getItem(`summaryConfig_${columnKey}`);
      if (savedConfig) {
        try {
          const config = JSON.parse(savedConfig);
          setCachedSummaryConfig(config);
        } catch (error) {
          console.error('Failed to parse cached summary config:', error);
        }
      }
    }
  }, [columns]);

  const saveSummaryConfig = (config: {
    groupByColumns: string[];
    sumColumns: string[];
    customColumns: CustomColumn[];
  }) => {
    if (columns.length > 0) {
      const columnKey = columns.map(col => col.dataIndex[0]).join('');
      localStorage.setItem(`summaryConfig_${columnKey}`, JSON.stringify(config));
      setCachedSummaryConfig(config);
    }
  };

  const resetSummaryConfig = () => {
    if (columns.length > 0) {
      const columnKey = columns.map(col => col.dataIndex[0]).join('');
      localStorage.removeItem(`summaryConfig_${columnKey}`);
      setCachedSummaryConfig(null);
      summaryForm.resetFields();
      message.success('汇总配置已重置');
    }
  };

  // 添加防抖处理函数
  const debouncedHandleUpload = (fileList: File[]) => {
    if (uploadTimeoutRef.current) {
      clearTimeout(uploadTimeoutRef.current);
    }

    uploadTimeoutRef.current = setTimeout(() => {
      handleUpload(fileList);
    }, 300);
  };

  const handleUpload = async (fileList: File[]) => {
    // 检查是否正在处理
    if (isProcessing) {
      message.warning('正在处理文件，请稍候...');
      return;
    }

    // 检查是否有重复文件
    const newFiles = fileList.filter(file => !processingFilesRef.current.has(file.name));
    if (newFiles.length === 0) {
      return;
    }

    try {
      setIsProcessing(true);
      setLoading(true);
      setProgress(0);
      setLoadingText('正在解析文件...');
      
      // 将新文件添加到处理集合中
      newFiles.forEach(file => processingFilesRef.current.add(file.name));
      
      const allData: FileData[] = [];
      
      console.time('handleUpload');
      // 使用 Promise.all 并行处理文件
      const filePromises = newFiles.map(async (file, index) => {
        const data = await file.arrayBuffer();
        let workbook;
        
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder('utf-8').decode(data);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          workbook = XLSX.read(data);
        }
        
        const { headers, data: sheetData } = getAllSheetData(workbook, file.name);
        if (sheetData.length > 0) {
          allData.push({
            headers,
            data: sheetData
          });
        }
        
        // 更新进度
        const newProgress = Math.round(((index + 1) / newFiles.length) * 50);
        setProgress(newProgress);
        setLoadingText(`正在解析文件... (${index + 1}/${newFiles.length})`);
      });

      await Promise.all(filePromises);
      console.timeEnd('handleUpload');
      setLoadingText('正在合并数据...');
      setProgress(60);

      // 获取所有列名
      const allHeaders = allData.map(item => item.headers).flat();
      const uniqueHeaders = Array.from(new Set(allHeaders)).filter(col => col !== 'source' && col !== '__rowId');
      // 检查列名一致性
      const diffItems: string[] = [];
      
      allData.forEach(({ headers }) => {
        uniqueHeaders.forEach(col => {
          if (!headers.includes(col)) {
            diffItems.push(col);
          }
        });
      });
      
      setProgress(80);
      
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
          onOk: async () => {
            setLoadingText('正在合并数据...');
            const { columns, data } = mergeData(allData.map(item => item.data),allData[0].headers);
            setColumns(columns.map((col) => ({ title: col, dataIndex: col, key: col })));
            setTableData(data);
            const newColumnEnums: ColumnEnums = {};
            updateColumnEnums(data, newColumnEnums);
            setColumnEnums(newColumnEnums);
            setProgress(100);
            setLoadingText('合并完成！');
            await new Promise(resolve => setTimeout(resolve, 1000));
            setLoading(false);
            setProgress(0);
            message.success("Excel/CSV 文件解析并合并成功！");
          },
          onCancel: () => {
            setLoading(false);
            setProgress(0);
            message.info('已取消合并');
          },
        });
        return;
      }
      
      // 确保在合并数据前显示正确的状态
      setLoadingText('正在合并数据...');
      const { columns, data } = mergeData(allData.map(item => item.data),allData[0].headers);
      setColumns(columns.map((col) => ({ title: col, dataIndex: col, key: col })));
      setTableData(data);
      const newColumnEnums: ColumnEnums = {};
      updateColumnEnums(data, newColumnEnums);
      setColumnEnums(newColumnEnums);
      // 只有在所有数据处理完成后才显示完成状态
      setProgress(100);
      setLoadingText('合并完成！');
      await new Promise(resolve => setTimeout(resolve, 1000));
      setLoading(false);
      setProgress(0);
      message.success("Excel/CSV 文件解析并合并成功！");
    } catch (err) {
      setLoading(false);
      setProgress(0);
      message.error("解析 Excel/CSV 文件失败");
    } finally {
      // 清理处理状态
      newFiles.forEach(file => processingFilesRef.current.delete(file.name));
      setIsProcessing(false);
    }
  };

  const handleExport = async () => {
    if (!tableData.length) return;
    
    try {
      setLoading(true);
      setLoadingText('正在准备导出...');
      setProgress(0);

      const BATCH_SIZE = 10000;
      const totalBatches = Math.ceil(tableData.length / BATCH_SIZE);
      let csvContent = '';
      
      // 添加表头
      const headers = columns.map(col => col.title).join(',');
      csvContent += headers + '\n';
      
      // 分批处理数据
      for (let i = 0; i < totalBatches; i++) {
        const start = i * BATCH_SIZE;
        const end = Math.min(start + BATCH_SIZE, tableData.length);
        const batch = tableData.slice(start, end);
        
        // 处理每一行数据
        const rows = batch.map(row => {
          return columns.map(col => {
            const value = row[col.dataIndex];
            // 处理特殊字符，确保CSV格式正确
            if (typeof value === 'string' && (value.includes(',') || value.includes('"') || value.includes('\n'))) {
              return `"${value.replace(/"/g, '""')}"`;
            }
            return value;
          }).join(',');
        }).join('\n');
        
        csvContent += rows + '\n';
        
        // 更新进度
        const progress = Math.round(((i + 1) / totalBatches) * 100);
        setProgress(progress);
        setLoadingText(`正在导出数据... ${progress}%`);
      }
      
      // 创建并下载文件
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'merged.csv';
      link.click();
      URL.revokeObjectURL(url);
      
      setProgress(100);
      setLoadingText('导出完成！');
      message.success('文件导出成功！');
    } catch (error) {
      console.error('导出失败:', error);
      message.error('导出失败，请重试');
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  const handleSummary = () => {
    setSummaryModalVisible(true);
    setSummaryStep(1);
    if (cachedSummaryConfig) {
      summaryForm.setFieldsValue(cachedSummaryConfig);
    } else {
      summaryForm.resetFields();
    }
  };

  const handleSummaryStep1 = async () => {
    try {
      const values = await summaryForm.validateFields();
      const { groupByColumns, sumColumns, customColumns } = values;
      
      saveSummaryConfig({ groupByColumns, sumColumns, customColumns });
      
      const groupDateRanges = new Map<string, { [key: string]: { min: number, max: number } }>();
      
      tableData.forEach(row => {
        const groupKey = groupByColumns.map((col: string) => row[col]).join('|');
        if (!groupDateRanges.has(groupKey)) {
          groupDateRanges.set(groupKey, {});
        }
        
        const groupRanges = groupDateRanges.get(groupKey)!;
        
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
      
      const groupedData = new Map();
      
      tableData.forEach(row => {
        const groupKey = groupByColumns.map((col: string) => row[col]).join('|');
        if (!groupedData.has(groupKey)) {
          groupedData.set(groupKey, {
            ...groupByColumns.reduce((acc: Record<string, any>, col: string) => ({ ...acc, [col]: row[col] }), {}),
            ...sumColumns.reduce((acc: Record<string, any>, col: { column: string, calculationType: string }) => {
              const columnEnum = columnEnums[col.column];
              if (columnEnum?.type === 'number') {
                return { ...acc, [col.column]: 0 };
              }
              return { ...acc, [col.column]: new Set() };
            }, {}),
            ...customColumns.reduce((acc: Record<string, any>, col: CustomColumn) => {
              const columnEnum = columnEnums[col.valueColumn];
              if (columnEnum?.type === 'number') {
                return { ...acc, [col.name]: 0 };
              }
              return { ...acc, [col.name]: new Set() };
            }, {})
          });
        }
        
        const group = groupedData.get(groupKey);
        
        sumColumns.forEach((col: { column: string, calculationType: string }) => {
          const columnEnum = columnEnums[col.column];
          const value = row[col.column];
          
          if (columnEnum?.type === 'number') {
            switch (col.calculationType) {
              case 'sum':
                group[col.column] += Number(value) || 0;
                break;
              case 'average':
                group[col.column] += Number(value) || 0;
                break;
              case 'count':
                group[col.column] += 1;
                break;
              case 'uniqueCount':
                group[col.column] = new Set([...group[col.column], value]).size;
                break;
            }
          } else {
            switch (col.calculationType) {
              case 'count':
                group[col.column] += 1;
                break;
              case 'uniqueCount':
                group[col.column].add(value);
                break;
            }
          }
        });
        
        customColumns.forEach((customCol: CustomColumn) => {
          const { name, conditions, valueColumn, logic, calculationType } = customCol;
          const columnEnum = columnEnums[valueColumn];
          
          const conditionResult = conditions.every((condition: CustomColumnCondition) => {
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
          
          if (logic === 'and' ? conditionResult : conditions.some((condition: CustomColumnCondition) => {
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
            const value = row[valueColumn];
            
            if (columnEnum?.type === 'number') {
              switch (calculationType) {
                case 'sum':
                  group[name] += Number(value) || 0;
                  break;
                case 'average':
                  group[name] += Number(value) || 0;
                  break;
                case 'count':
                  group[name] += 1;
                  break;
                case 'uniqueCount':
                  group[name] = new Set([...group[name], value]).size;
                  break;
              }
            } else {
              switch (calculationType) {
                case 'count':
                  group[name] += 1;
                  break;
                case 'uniqueCount':
                  group[name].add(value);
                  break;
              }
            }
          }
        });
      });
      
      const resultData = Array.from(groupedData.values()).map(group => {
        const result = { ...group };
        
        // 处理平均值
        sumColumns.forEach((col: { column: string, calculationType: string }) => {
          if (col.calculationType === 'average' && columnEnums[col.column]?.type === 'number') {
            result[col.column] = result[col.column] / tableData.length;
          }
        });
        
        customColumns.forEach((col: CustomColumn) => {
          if (col.calculationType === 'average' && columnEnums[col.valueColumn]?.type === 'number') {
            result[col.name] = result[col.name] / tableData.length;
          }
        });
        
        return result;
      });
      
      setSummaryResult(resultData);
      
      const resultColumns = [
        ...groupByColumns.map((col: string) => ({ title: col, dataIndex: col, key: col })),
        ...sumColumns.map((col: { column: string, calculationType: string }) => {
          const columnEnum = columnEnums[col.column];
          const title = columnEnum?.type === 'number' ? 
            `${col.column} (${col.calculationType === 'sum' ? '求和' : 
                          col.calculationType === 'average' ? '平均' : 
                          col.calculationType === 'uniqueCount' ? '去重计数' : 
                          '不去重计数'})` :
            `${col.column} (${col.calculationType === 'uniqueCount' ? '去重计数' : '不去重计数'})`;
          
          return {
            title,
            dataIndex: col.column,
            key: col.column,
            render: (val: number | Set<any>) => {
              if (val instanceof Set) {
                return val.size;
              }
              return typeof val === 'number' ? val.toFixed(2) : val;
            }
          };
        }),
        ...customColumns.map((col: CustomColumn) => {
          const columnEnum = columnEnums[col.valueColumn];
          const title = columnEnum?.type === 'number' ? 
            `${col.name} (${col.calculationType === 'sum' ? '求和' : 
                          col.calculationType === 'average' ? '平均' : 
                          col.calculationType === 'uniqueCount' ? '去重计数' : 
                          '不去重计数'})` :
            `${col.name} (${col.calculationType === 'uniqueCount' ? '去重计数' : '不去重计数'})`;
          
          return {
            title,
            dataIndex: col.name,
            key: col.name,
            render: (val: number | Set<any>) => {
              if (val instanceof Set) {
                return val.size;
              }
              return typeof val === 'number' ? val.toFixed(2) : val;
            }
          };
        })
      ];
      
      setSummaryColumns(resultColumns);
      setSummaryStep(2);
    } catch (error) {
      message.error('请检查输入是否正确');
    }
  };

  // 优化表格列配置
  const optimizedColumns = columns.map(col => {
    const columnEnum = columnEnums[col.dataIndex];
    const baseConfig = {
      ...col,
      width: 150, // 设置固定列宽
      ellipsis: true, // 文本溢出时显示省略号
    };

    // 根据列类型添加筛选器
    if (columnEnum) {
      if (columnEnum.type === 'date') {
        return {
          ...baseConfig,
          filters: Array.from(columnEnum.values).map(value => ({
            text: formatDateString(value),
            value: value
          })),
          onFilter: (value: string, record: any) => record[col.dataIndex] === value,
          sorter: (a: any, b: any) => new Date(a[col.dataIndex]).getTime() - new Date(b[col.dataIndex]).getTime()
        };
      } else if (columnEnum.type === 'text') {
        return {
          ...baseConfig,
          filters: Array.from(columnEnum.values).map(value => ({
            text: value,
            value: value
          })),
          onFilter: (value: string, record: any) => record[col.dataIndex] === value,
          sorter: (a: any, b: any) => String(a[col.dataIndex]).localeCompare(String(b[col.dataIndex]))
        };
      } else if (columnEnum.type === 'number') {
        return {
          ...baseConfig,
          sorter: (a: any, b: any) => Number(a[col.dataIndex]) - Number(b[col.dataIndex])
        };
      }
    }

    return baseConfig;
  });

  // 在组件卸载时清理
  useEffect(() => {
    return () => {
      if (uploadTimeoutRef.current) {
        clearTimeout(uploadTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <Spin spinning={loading} tip={loadingText}>
        <div style={{ position: 'relative' }}>
          {loading && (
            <div style={{ 
              position: 'absolute', 
              top: '50%', 
              left: '50%', 
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
              background: 'rgba(255, 255, 255, 0.9)',
              padding: '20px',
              borderRadius: '8px',
              boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
              width: '300px',
              textAlign: 'center'
            }}>
              <Progress percent={progress} status="active" />
              <div style={{ marginTop: '10px' }}>{loadingText}</div>
            </div>
          )}
          
          <Space>
            <Upload
              multiple
              accept=".xlsx,.xls,.csv"
              beforeUpload={() => false}
              onChange={(info: any) => {
                const files = info.fileList.map((f: any) => f.originFileObj).filter(Boolean) as File[];
                debouncedHandleUpload(files);
              }}
              showUploadList={true}
              disabled={isProcessing}
            >
              <Button icon={<UploadOutlined />} disabled={isProcessing}>
                上传 Excel/CSV 文件（支持多选）
              </Button>
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
            columns={optimizedColumns}
            dataSource={tableData}
            rowKey="__rowId"
            scroll={{ x: "max-content", y: 600 }}
            bordered
            style={{ marginTop: 16 }}
            pagination={{
              pageSize: 100,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 条`,
            }}
            virtual
          />
        </div>
      </Spin>
      
      <Modal
        title="数据汇总"
        open={summaryModalVisible}
        onCancel={() => setSummaryModalVisible(false)}
        width={800}
        footer={summaryStep === 1 ? [
          <Button key="reset" onClick={resetSummaryConfig} icon={<ReloadOutlined />}>
            重置配置
          </Button>,
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
        {summaryStep === 1 ? (
          <SummaryForm
            columns={columns}
            columnEnums={columnEnums}
            form={summaryForm}
          />
        ) : (
          <SummaryResult
            columns={summaryColumns}
            data={summaryResult}
          />
        )}
      </Modal>
      
      {contextHolder}
    </div>
  );
}