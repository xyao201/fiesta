import React from 'react';
import { Form, Select, Input, Radio, Button, Space } from 'antd';
import { ColumnEnums, CustomColumn, CalculationType } from '../types';
import { formatDateString } from '../utils';

interface SummaryFormProps {
  columns: { title: string; dataIndex: string; key: string }[];
  columnEnums: ColumnEnums;
  form: any;
}

const getAvailableCalculationTypes = (columnEnum: ColumnEnums[string] | undefined): CalculationType[] => {
  if (!columnEnum) return [];
  
  if (columnEnum.type === 'number') {
    return ['sum', 'uniqueCount', 'count', 'average'];
  }
  
  return ['uniqueCount', 'count'];
};

export const SummaryForm: React.FC<SummaryFormProps> = ({ columns, columnEnums, form }) => {
  return (
    <Form form={form} layout="vertical">
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
      
      <Form.List name="sumColumns">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <Space key={field.key} align="baseline">
                <Form.Item
                  name={[field.name, 'column']}
                  rules={[{ required: true, message: '请选择列' }]}
                >
                  <Select 
                    style={{ width: 200 }} 
                    placeholder="选择列"
                    onChange={(value) => {
                      form.setFieldsValue({
                        sumColumns: {
                          [field.name]: {
                            calculationType: undefined
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
                  name={[field.name, 'calculationType']}
                  rules={[{ required: true, message: '请选择计算方式' }]}
                >
                  <Select 
                    style={{ width: 150 }} 
                    placeholder="选择计算方式"
                  >
                    {(() => {
                      const columnField = form.getFieldValue(['sumColumns', field.name, 'column']);
                      const columnEnum = columnField ? columnEnums[columnField] : undefined;
                      const availableTypes = getAvailableCalculationTypes(columnEnum);
                      
                      return availableTypes.map(type => (
                        <Select.Option key={type} value={type}>
                          {type === 'sum' ? '求和' : 
                           type === 'uniqueCount' ? '去重计数' : 
                           type === 'count' ? '不去重计数' : 
                           '求平均'}
                        </Select.Option>
                      ));
                    })()}
                  </Select>
                </Form.Item>
                
                <Button type="link" onClick={() => remove(field.name)}>
                  删除
                </Button>
              </Space>
            ))}
            <Button type="dashed" onClick={() => add()} block>
              添加计算列
            </Button>
          </>
        )}
      </Form.List>
      
      <Form.List name="customColumns">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field, index) => (
              <div key={`custom-column-${field.key}`} style={{ border: '1px solid #d9d9d9', padding: 16, marginBottom: 16, borderRadius: 4 }}>
                <Space direction="vertical" style={{ width: '100%' }}>
                  <Form.Item
                    name={[field.name, 'name']}
                    rules={[{ required: true, message: '请输入列名' }]}
                  >
                    <Input placeholder="自定义列名" />
                  </Form.Item>
                  
                  <Form.Item
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
                        {conditionFields.map((conditionField, conditionIndex) => (
                          <Space key={`condition-${conditionField.key}`} align="baseline">
                            <Form.Item
                              name={[conditionField.name, 'column']}
                              rules={[{ required: true, message: '请选择列' }]}
                            >
                              <Select 
                                style={{ width: 120 }} 
                                placeholder="选择列"
                                onChange={(value) => {
                                  form.setFieldsValue({
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
                              name={[conditionField.name, 'operator']}
                              rules={[{ required: true, message: '请选择运算符' }]}
                            >
                              <Select 
                                style={{ width: 120 }} 
                                placeholder="选择运算符"
                                onChange={(value) => {
                                  if (value === 'earliest' || value === 'latest') {
                                    form.setFieldsValue({
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
                                  const columnField = form.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'column']);
                                  const columnEnum = columnField ? columnEnums[columnField] : undefined;
                                  
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
                              name={[conditionField.name, 'value']}
                              rules={[{ 
                                required: true,
                                validator: (_, value) => {
                                  const operator = form.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'operator']);
                                  if (operator !== 'earliest' && operator !== 'latest' && !value) {
                                    return Promise.reject('请选择或输入值');
                                  }
                                  return Promise.resolve();
                                }
                              }]}
                            >
                              <Select
                                style={{ width: 200 }}
                                placeholder="选择或输入值"
                                showSearch
                                allowClear
                                mode="tags"
                              >
                                {(() => {
                                  const columnField = form.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'column']);
                                  const operator = form.getFieldValue(['customColumns', field.name, 'conditions', conditionField.name, 'operator']);
                                  const columnEnum = columnField ? columnEnums[columnField] : undefined;

                                  if (operator === 'earliest' || operator === 'latest') {
                                    return (
                                      <Select.Option key={operator} value={operator}>
                                        {operator === 'earliest' ? '最早日期' : '最晚日期'}
                                      </Select.Option>
                                    );
                                  }
                                  
                                  if (columnField && columnEnums[columnField]) {
                                    return Array.from(columnEnum?.values || new Set<string>()).map(value => {
                                      if (columnEnum?.type === 'date') {
                                        const formattedValue = formatDateString(value as string);
                                        return (
                                          <Select.Option key={value as string} value={value as string}>
                                            {formattedValue}
                                          </Select.Option>
                                        );
                                      }
                                      return (
                                        <Select.Option key={value as string} value={value as string}>
                                          {value as string}
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
                    name={[field.name, 'valueColumn']}
                    rules={[{ required: true, message: '请选择值列' }]}
                  >
                    <Select placeholder="选择值列">
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
                    name={[field.name, 'calculationType']}
                    rules={[{ required: true, message: '请选择计算方式' }]}
                  >
                    <Select placeholder="选择计算方式">
                      {(() => {
                        const valueColumn = form.getFieldValue(['customColumns', field.name, 'valueColumn']);
                        const columnEnum = valueColumn ? columnEnums[valueColumn] : undefined;
                        const availableTypes = getAvailableCalculationTypes(columnEnum);
                        
                        return availableTypes.map(type => (
                          <Select.Option key={type} value={type}>
                            {type === 'sum' ? '求和' : 
                             type === 'uniqueCount' ? '去重计数' : 
                             type === 'count' ? '不去重计数' : 
                             '求平均'}
                          </Select.Option>
                        ));
                      })()}
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
}; 