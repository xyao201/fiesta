"use client";
import React, { useState } from "react";
import { Upload, Button, Table, message, Modal } from "antd";
import { UploadOutlined, DownloadOutlined } from "@ant-design/icons";
import * as XLSX from "xlsx";
import { saveAs } from "file-saver";

const getAllSheetData = (workbook: XLSX.WorkBook, filename: string) => {
  let allData: any[] = [];
  const sheetNames = workbook.SheetNames;
  const singleSheet = sheetNames.length === 1;
  sheetNames.forEach((sheetName) => {
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
    const newRow: any = {};
    allColumns.forEach((col) => {
      newRow[col] = row[col] ?? "";
    });
    newRow.__rowId = `row_${rowId++}`;
    return newRow;
  });
  return { columns: allColumns, data: merged };
};

export default function MergeExcelPage() {
  const [tableData, setTableData] = useState<any[]>([]);
  const [columns, setColumns] = useState<any[]>([]);
  const [modal, contextHolder] = Modal.useModal();

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
        sheetNames.forEach((sheetName) => {
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

  return (
    <div style={{ padding: 24 }}>
      <Upload
        multiple
        accept=".xlsx,.xls,.csv"
        beforeUpload={() => false}
        onChange={(info) => {
          const files = info.fileList.map((f) => f.originFileObj).filter(Boolean) as File[];
          handleUpload(files);
        }}
        showUploadList={true}
      >
        <Button icon={<UploadOutlined />}>上传 Excel/CSV 文件（支持多选）</Button>
      </Upload>
      <Button
        icon={<DownloadOutlined />}
        type="primary"
        style={{ margin: "16px 0" }}
        onClick={handleExport}
        disabled={!tableData.length}
      >
        导出合并后的 Excel
      </Button>
      <Table
        columns={columns}
        dataSource={tableData}
        rowKey="__rowId"
        scroll={{ x: "max-content" }}
        bordered
      />
      {contextHolder}
    </div>
  );
}