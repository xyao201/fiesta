"use client";
import React, { useState, useEffect } from "react";
import { Upload, Button, Table, message, Modal, Space, Form, Spin, Progress } from "antd";
import { UploadOutlined, DownloadOutlined, BarChartOutlined, ReloadOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";
import { ColumnEnums, CustomColumn, CustomColumnCondition } from "./types";
import { getAllSheetData, mergeData, updateColumnEnums } from "./utils";
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

  useEffect(() => {
    const savedConfig = localStorage.getItem('summaryConfig');
    if (savedConfig) {
      try {
        const config = JSON.parse(savedConfig);
        setCachedSummaryConfig(config);
      } catch (error) {
        console.error('Failed to parse cached summary config:', error);
      }
    }
  }, []);

  const saveSummaryConfig = (config: {
    groupByColumns: string[];
    sumColumns: string[];
    customColumns: CustomColumn[];
  }) => {
    localStorage.setItem('summaryConfig', JSON.stringify(config));
    setCachedSummaryConfig(config);
  };

  const resetSummaryConfig = () => {
    localStorage.removeItem('summaryConfig');
    setCachedSummaryConfig(null);
    summaryForm.resetFields();
    message.success('汇总配置已重置');
  };

  const handleUpload = async (fileList: File[]) => {
    try {
      setLoading(true);
      setProgress(0);
      setLoadingText('正在解析文件...');
      
      const allData: any[][] = [];
      const allHeaders: string[][] = [];
      
      // 使用 Promise.all 并行处理文件
      const filePromises = fileList.map(async (file, index) => {
        const data = await file.arrayBuffer();
        let workbook;
        
        if (file.name.endsWith('.csv')) {
          const text = new TextDecoder('utf-8').decode(data);
          workbook = XLSX.read(text, { type: 'string' });
        } else {
          workbook = XLSX.read(data);
        }
        
        const sheetNames = workbook.SheetNames;
        const singleSheet = sheetNames.length === 1;
        
        sheetNames.forEach((sheetName: string) => {
          const sheet = workbook.Sheets[sheetName];
          const json = XLSX.utils.sheet_to_json(sheet, { defval: "" });
          if (json.length === 0) return;
          
          const columns = Object.keys(json[0] || {});
          const firstCol = columns[0];
          const filtered = json.filter((row: any) => {
            const val = row[firstCol];
            return !(typeof val === 'string' && val.trim().startsWith('#'));
          });
          
          if (filtered.length === 0) return;
          allHeaders.push(columns);
        });
        
        allData.push(getAllSheetData(workbook, file.name));
        
        // 更新进度
        const newProgress = Math.round(((index + 1) / fileList.length) * 50);
        setProgress(newProgress);
        setLoadingText(`正在解析文件... (${index + 1}/${fileList.length})`);
      });

      await Promise.all(filePromises);
      
      setLoadingText('正在合并数据...');
      setProgress(60);
      
      const headerSet = allHeaders.map(cols => new Set(cols));
      let allCols: Set<string> = new Set();
      headerSet.forEach(set => set.forEach(col => allCols.add(col)));
      
      const diffItems: string[] = [];
      allCols.forEach(col => {
        if (!headerSet.every(set => set.has(col))) {
          diffItems.push(col);
        }
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
            const { columns, data } = mergeData(allData);
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
      const { columns, data } = mergeData(allData);
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
            ...sumColumns.reduce((acc: Record<string, number>, col: string) => ({ ...acc, [col]: 0 }), {}),
            ...customColumns.reduce((acc: Record<string, number>, col: CustomColumn) => ({ ...acc, [col.name]: 0 }), {})
          });
        }
        
        const group = groupedData.get(groupKey);
        
        sumColumns.forEach((col: string) => {
          group[col] += Number(row[col]) || 0;
        });
        
        customColumns.forEach((customCol: CustomColumn) => {
          const { name, conditions, valueColumn, logic } = customCol;
          
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
            group[name] += Number(row[valueColumn]) || 0;
          }
        });
      });
      
      const resultData = Array.from(groupedData.values());
      setSummaryResult(resultData);
      
      const resultColumns = [
        ...groupByColumns.map((col: string) => ({ title: col, dataIndex: col, key: col })),
        ...sumColumns.map((col: string) => ({ 
          title: `${col} (汇总)`, 
          dataIndex: col, 
          key: col,
          render: (val: number) => val.toFixed(2)
        })),
        ...customColumns.map((col: CustomColumn) => ({
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

  // 优化表格列配置
  const optimizedColumns = columns.map(col => ({
    ...col,
    width: 150, // 设置固定列宽
    ellipsis: true, // 文本溢出时显示省略号
  }));

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