import React from 'react';
import { Table, Button } from 'antd';
import { DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

interface SummaryResultProps {
  columns: any[];
  data: any[];
}

export const SummaryResult: React.FC<SummaryResultProps> = ({ columns, data }) => {
  const handleExport = () => {
    if (!data.length) return;
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Summary");
    const wbout = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    saveAs(new Blob([wbout], { type: "application/octet-stream" }), "summary.xlsx");
  };

  return (
    <>
      <Table
        columns={columns}
        dataSource={data}
        rowKey={(record) => Object.values(record).join('|')}
        scroll={{ x: "max-content" }}
        bordered
      />
      <Button
        type="primary"
        icon={<DownloadOutlined />}
        onClick={handleExport}
        style={{ marginTop: 16 }}
      >
        导出汇总结果
      </Button>
    </>
  );
}; 