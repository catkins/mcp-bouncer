import type { Meta, StoryObj } from '@storybook/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
} from './table';
import { Badge } from './badge';
import { Button } from './button';
import { MoreHorizontal, ArrowUpDown, Eye, Edit, Trash2 } from 'lucide-react';

const meta: Meta<typeof Table> = {
  title: 'UI/Table',
  component: Table,
  parameters: {
    layout: 'padded',
  },
  tags: ['autodocs'],
};

export default meta;
type Story = StoryObj<typeof meta>;

export const Basic: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Role</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
          <TableCell>Admin</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
          <TableCell>User</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Bob Johnson</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>Moderator</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithCaption: Story = {
  render: () => (
    <Table>
      <TableCaption>A list of your recent invoices.</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>Invoice</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Method</TableHead>
          <TableHead className="text-right">Amount</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">#INV001</TableCell>
          <TableCell>Paid</TableCell>
          <TableCell>Credit Card</TableCell>
          <TableCell className="text-right">$250.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">#INV002</TableCell>
          <TableCell>Pending</TableCell>
          <TableCell>PayPal</TableCell>
          <TableCell className="text-right">$150.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">#INV003</TableCell>
          <TableCell>Unpaid</TableCell>
          <TableCell>Bank Transfer</TableCell>
          <TableCell className="text-right">$350.00</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithFooter: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Product</TableHead>
          <TableHead>Quantity</TableHead>
          <TableHead>Price</TableHead>
          <TableHead className="text-right">Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>Widget A</TableCell>
          <TableCell>2</TableCell>
          <TableCell>$10.00</TableCell>
          <TableCell className="text-right">$20.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Widget B</TableCell>
          <TableCell>1</TableCell>
          <TableCell>$15.00</TableCell>
          <TableCell className="text-right">$15.00</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>Widget C</TableCell>
          <TableCell>3</TableCell>
          <TableCell>$8.00</TableCell>
          <TableCell className="text-right">$24.00</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>Total</TableCell>
          <TableCell className="text-right font-medium">$59.00</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};

export const WithBadges: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>User</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Role</TableHead>
          <TableHead>Last Active</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                JD
              </div>
              <div>
                <div className="font-medium">John Doe</div>
                <div className="text-sm text-gray-500">john@example.com</div>
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="default">Active</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="secondary">Admin</Badge>
          </TableCell>
          <TableCell>2 hours ago</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                JS
              </div>
              <div>
                <div className="font-medium">Jane Smith</div>
                <div className="text-sm text-gray-500">jane@example.com</div>
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="outline">Away</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="outline">User</Badge>
          </TableCell>
          <TableCell>1 day ago</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
                BJ
              </div>
              <div>
                <div className="font-medium">Bob Johnson</div>
                <div className="text-sm text-gray-500">bob@example.com</div>
              </div>
            </div>
          </TableCell>
          <TableCell>
            <Badge variant="destructive">Offline</Badge>
          </TableCell>
          <TableCell>
            <Badge variant="secondary">Moderator</Badge>
          </TableCell>
          <TableCell>3 days ago</TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const WithActions: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">John Doe</TableCell>
          <TableCell>john@example.com</TableCell>
          <TableCell>
            <Badge variant="default">Active</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button size="icon" variant="ghost">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Jane Smith</TableCell>
          <TableCell>jane@example.com</TableCell>
          <TableCell>
            <Badge variant="outline">Pending</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button size="icon" variant="ghost">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Bob Johnson</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>
            <Badge variant="destructive">Inactive</Badge>
          </TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-2">
              <Button size="icon" variant="ghost">
                <Eye className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Edit className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const Sortable: Story = {
  render: () => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <Button variant="ghost" className="h-auto p-0 font-medium">
              Name
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button variant="ghost" className="h-auto p-0 font-medium">
              Email
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>
            <Button variant="ghost" className="h-auto p-0 font-medium">
              Date Joined
              <ArrowUpDown className="ml-2 h-4 w-4" />
            </Button>
          </TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell className="font-medium">Alice Cooper</TableCell>
          <TableCell>alice@example.com</TableCell>
          <TableCell>2024-01-15</TableCell>
          <TableCell>
            <Badge variant="default">Active</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Bob Dylan</TableCell>
          <TableCell>bob@example.com</TableCell>
          <TableCell>2024-01-10</TableCell>
          <TableCell>
            <Badge variant="outline">Pending</Badge>
          </TableCell>
        </TableRow>
        <TableRow>
          <TableCell className="font-medium">Charlie Brown</TableCell>
          <TableCell>charlie@example.com</TableCell>
          <TableCell>2024-01-05</TableCell>
          <TableCell>
            <Badge variant="destructive">Inactive</Badge>
          </TableCell>
        </TableRow>
      </TableBody>
    </Table>
  ),
};

export const LongContent: Story = {
  render: () => (
    <div className="max-w-4xl">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>ID</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Description</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {Array.from({ length: 10 }, (_, i) => (
            <TableRow key={i}>
              <TableCell className="font-medium">#{1000 + i}</TableCell>
              <TableCell>Project {String.fromCharCode(65 + i)}</TableCell>
              <TableCell className="max-w-xs truncate">
                This is a very long description that should be truncated when it exceeds the maximum width
              </TableCell>
              <TableCell>
                <Badge variant={i % 3 === 0 ? 'default' : i % 3 === 1 ? 'outline' : 'destructive'}>
                  {i % 3 === 0 ? 'Active' : i % 3 === 1 ? 'Pending' : 'Inactive'}
                </Badge>
              </TableCell>
              <TableCell>2024-01-{(i + 1).toString().padStart(2, '0')}</TableCell>
              <TableCell>
                <Button size="icon" variant="ghost">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  ),
};

export const ResponsiveTable: Story = {
  render: () => (
    <div className="w-full">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[100px]">Invoice</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Method</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell className="font-medium">#INV001</TableCell>
            <TableCell>
              <Badge variant="default">Paid</Badge>
            </TableCell>
            <TableCell>Credit Card</TableCell>
            <TableCell className="text-right">$250.00</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">#INV002</TableCell>
            <TableCell>
              <Badge variant="outline">Pending</Badge>
            </TableCell>
            <TableCell>PayPal</TableCell>
            <TableCell className="text-right">$150.00</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">#INV003</TableCell>
            <TableCell>
              <Badge variant="destructive">Unpaid</Badge>
            </TableCell>
            <TableCell>Bank Transfer</TableCell>
            <TableCell className="text-right">$350.00</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">#INV004</TableCell>
            <TableCell>
              <Badge variant="default">Paid</Badge>
            </TableCell>
            <TableCell>Credit Card</TableCell>
            <TableCell className="text-right">$450.00</TableCell>
          </TableRow>
          <TableRow>
            <TableCell className="font-medium">#INV005</TableCell>
            <TableCell>
              <Badge variant="outline">Pending</Badge>
            </TableCell>
            <TableCell>PayPal</TableCell>
            <TableCell className="text-right">$550.00</TableCell>
          </TableRow>
        </TableBody>
        <TableFooter>
          <TableRow>
            <TableCell colSpan={3}>Total</TableCell>
            <TableCell className="text-right">$1,750.00</TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </div>
  ),
};
