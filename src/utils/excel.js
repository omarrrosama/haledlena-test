const ExcelJS = require('exceljs');

const exportOrdersToExcel = async (orders) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Haled Lena Admin';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Orders', {
    pageSetup: { paperSize: 9, orientation: 'landscape' }
  });

  // Header styling
  const headerFill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1A1A1A' } };
  const headerFont = { color: { argb: 'FFFFFFFF' }, bold: true, size: 11 };

  // Columns
  sheet.columns = [
    { header: 'Order #', key: 'orderNumber', width: 18 },
    { header: 'Date', key: 'date', width: 18 },
    { header: 'Customer Name', key: 'customerName', width: 22 },
    { header: 'Phone', key: 'phone', width: 16 },
    { header: 'Email', key: 'email', width: 26 },
    { header: 'City', key: 'city', width: 16 },
    { header: 'Address', key: 'address', width: 30 },
    { header: 'Items', key: 'items', width: 40 },
    { header: 'Subtotal', key: 'subtotal', width: 12 },
    { header: 'Discount', key: 'discount', width: 12 },
    { header: 'Shipping', key: 'shipping', width: 12 },
    { header: 'Total', key: 'total', width: 12 },
    { header: 'Discount Code', key: 'discountCode', width: 16 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Notes', key: 'notes', width: 30 },
  ];

  // Style header row
  sheet.getRow(1).eachCell(cell => {
    cell.fill = headerFill;
    cell.font = headerFont;
    cell.alignment = { vertical: 'middle', horizontal: 'center' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF333333' } },
      bottom: { style: 'thin', color: { argb: 'FF333333' } }
    };
  });
  sheet.getRow(1).height = 22;

  // Status colors
  const statusColors = {
    pending: 'FFFFA500',
    confirmed: 'FF3498DB',
    processing: 'FF9B59B6',
    shipped: 'FF1ABC9C',
    delivered: 'FF2ECC71',
    cancelled: 'FFE74C3C'
  };

  // Add data rows
  orders.forEach((order, idx) => {
    const itemsText = order.items.map(i =>
      `${i.productName} (${i.size || '-'}/${i.color || '-'}) x${i.quantity}`
    ).join(', ');

    const row = sheet.addRow({
      orderNumber: order.orderNumber,
      date: new Date(order.createdAt).toLocaleString(),
      customerName: order.customer.name,
      phone: order.customer.phone,
      email: order.customer.email || '',
      city: order.customer.city,
      address: order.customer.address,
      items: itemsText,
      subtotal: order.subtotal,
      discount: order.discount || 0,
      shipping: order.shippingFee || 0,
      total: order.total,
      discountCode: order.discountCode || '',
      status: order.status.toUpperCase(),
      notes: order.customer.notes || ''
    });

    // Alternate row background
    const bgColor = idx % 2 === 0 ? 'FFFFFFFF' : 'FFF8F8F8';
    row.eachCell(cell => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Color status cell
    const statusCell = row.getCell('status');
    const color = statusColors[order.status] || 'FF888888';
    statusCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color } };
    statusCell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    statusCell.alignment = { horizontal: 'center', vertical: 'middle' };

    // Format currency cells
    ['subtotal', 'discount', 'shipping', 'total'].forEach(key => {
      row.getCell(key).numFmt = '$#,##0.00';
    });
  });

  // Summary row
  sheet.addRow([]);
  const summaryRow = sheet.addRow({
    orderNumber: 'TOTAL',
    total: orders.reduce((sum, o) => sum + o.total, 0)
  });
  summaryRow.getCell('orderNumber').font = { bold: true };
  summaryRow.getCell('total').numFmt = '$#,##0.00';
  summaryRow.getCell('total').font = { bold: true };

  // Freeze header
  sheet.views = [{ state: 'frozen', xSplit: 0, ySplit: 1, activeCell: 'A2' }];

  // Auto-filter
  sheet.autoFilter = { from: 'A1', to: 'O1' };

  return workbook;
};

module.exports = { exportOrdersToExcel };
