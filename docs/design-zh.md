# 众筹合约设计文档

## 目标

项目发起时，需要设置一个deadline(到期时间)。 在该时间前如果筹集足够资金，即可根据约定把这些资金汇入指定账户。如果超过该时间，则项目失败，捐款者可以之前捐款时的凭证取回捐款资金。

- 因为该交易使用CKB作为资金，因此会在每一步中约定fee有谁提供。
- 如果筹集到足够资金，项目发起者必须在 deadline 之前完成汇款交易，否则项目失败。
- 如果捐款者太多，发起者需要定期归拢资金。否则全部交易可能无法在一笔交易中完成，如果多次串行交易时间太久同样可能会导致失败。

## 总体方案

使用CKB作为资金。

方案中将会出现两种角色： 

- Creator (发起者)（默认最终众筹资金打入其账户）
- Backer (捐款者)

这里将会出现三种类型的Cell：

- 众筹核心信息，包括Creator的LockScriptHash、Deadline、众筹项目信息等等
- 金库，用于存储 Backer 的资金。金库可能有多个，这些金库相互之间可以自由合并；在失败后，允许有限的拆分（并行退回资金，否则全都依赖同一个Cell，会导致退回资金的难度增大）
- 凭证，Backer在捐款后得到的一个凭证，该Cell由捐赠的一部分CKB生成。如果项目成功，这些CKB最终会作为项目资金的一部分汇给Creator；如果失败，则会直接返还给Backer。

整个众筹流程可以分为三步：

### 创建众筹项目

Creator 需要创建一个众筹项目，主要包括项目简介、结束时间、目标金额等。

在该过程中，将会发生一次链上交易： Creator 提供CKB/Fee来创建一个Cell，用于记录上述信息。

### 筹款

从项目发起到 deadline 之前这段时间，Backer将会向该项目提供CKB，同时收到一份捐款凭证；Creator需要及时归拢这些资金（把多个Cell合并成一个， 防止最终交易过大无法执行）。

### 众筹结束

在deadline之前筹够资金，Creator可以打包： 众筹项目和筹集的资金进行交易，最终这些资金（CKB）会转移到最初指定的账户。

**如果在deadline之后，即使筹够了足够的资金也会判定失败。**这时Backer可以使用凭证从资金池中取回资金。

整个流程将会涉及到五种交易：

- 发起众筹
- 捐款
- 归拢资金
- 项目成功
- 退款

以及三个合约：

- `Project` : 众筹核心，用于管理众筹项目
- `Contribution` : 用于管理捐款，可以相互合并
- `Claim` : 捐款后的凭证，在退款时需要

## Script 设计

### Project  （众筹项目核心）

*Type Script*

该合约用于管理整个众筹项目。

- Creator可以使用任何Cell来创建它
- 当在规定时间内筹够资金时
    - 交易中需要全部的Contribution参与
    - Output 会把全部的 Contribution 转给 Creator (Creator Lock Script Hash)， 且总数必须一致。
    - 可能需要Creator提供额外的Fee来保证交易完成。
- 超过 `deadline` 可以直接销毁。可以配合LockScript使用，用于保证过期后这些CKB的安全。

Args:

- `type_id` , 让该项目保证唯一
- `creator_lock_script_hash` , 众筹成功将汇入该账户
- `goal_amount` , 众筹目标金额
- `dealine` , 众筹结束时间
- `contribution_script` : contribution的Code Hash 和 Hash Type。防止恶意攻击
- `claim_script` Claim 的 Code Hash 和 Hash Type。同上
- `contribution_type` : 这里约定 contribution type script。为了防止有人恶意为Cell设置TypeScript

Cell Data:

- 众筹项目信息

### **Contribution （保存捐款）**

*Lock Script*

用于保管捐款资金。其作为Lock  Script，因此交易中需要提供。

其本身只是为了保管CKB，即便有人伪造也只是浪费自己的资金。同时Args中增加 `type_script_hash` ，如果type script不对则会导致该Cell永远无法解锁。

相互合并时：

- `deadline` 没有过期
- Deps中存在 `Project` ，且信息一致。
- 检查自身Cell的TypeScript （通过`type_script_hash`）
- Input 和 Output 中Contribution相关信息必须一致，并且 `capacity` 总和必须一致。
- 只允许从多个合并为一个

众筹成功：

- `deadline` 没有过期
- Input中必须存在 `Project`  Output中不存在，且信息一致
- 检查自身Cell的TypeScript （通过`type_script_hash`）
- Output中不允许存在 Contribution （自己的ScriptHash）

众筹失败：

- `dealine` 必须过期
- 检查自身Cell的TypeScript （通过`type_script_hash`）
- Input 中必须存在ClaimOutput中不存在，且信息一致。
- 其自身减少的 capacity 与 Claim 存在的一致

Args:

- `project_script_hash` , Project Script Hash
- `dealine` , 众筹结束时间。因为 Project 在众筹失败后，退款不需要它。

Cell Data: None

### Claim

Type Script

捐款凭证。该凭证有 Backer 提供的CKB铸造。其Lock Script 位置可以由捐款者自由提供。成功后捐款者也可以不去销毁自行收藏。

Claim 的销毁不需要Project参与。因为众筹成功后，全部的Contribution都将被销毁。如果有没被销毁的Contribution，则就可以凭借它退回资金。

（TODO： 是否考虑每个 Contribution 记录这些 Claim 的信息，这样可以解决： 众筹成功后，如果有漏掉的 Contribution，这时任何  Backer 都可以凭借其退款 ）

捐款：

- `deadline` 没有过期
- 其本身只在Output中
- Contribution中的 `capacity` 与其CellData中的一致
- Deps中存在Project且信息一致。

当众筹成功销毁时：

- `deadline` 已经过期

当众筹失败，需要退款时：

- `deadline` 已经过期
- Input中必须存在足够的 Contribution
- Ouptut 中必须转给 `backer_lock_script` 且数量与Cell Data中的一致

Args:

- `project_script_hash` , Project Script Hash
- `dealine` , 众筹结束时间
- `backer_lock_script` : 退还地址

Cell Data:

- `Amount` : 捐款金额

## 交易

### 创建众筹

```
Input:
	0: CKB...
Output:
	0:
		Lock: UserDefained
		Type: Project
			Args:
				type_id: ...
				creator_lock_script_hash: ...
				goal_amount: 100
				dealine: ...
```

Project:

- Check Type ID
- `deadline` 没有过期
- `goal_amount` 不为0

### 捐款

```
Input:
	0: CKB...
Output:
	0:
		Lock: Contribution
			Args:
				project_script_hash: ...
				dealine: ...
				type_script_hash: UserDefained Script Hash
		Type: UserDefained
		capacity: 10000
	1:
		Lock: UserDefained
		Type: Claim
		Cell Data: 10000
CellDeps:
	Project
```

Claim:

- 校验contribution 和 claim 的Code Hash 和Hash Type
- 通过 `project_script_hash` 获取Project Script 的 Args
- 校验 Project Cell的信息与当前是否匹配
- `deadline` 没有过期
- 只在 GroupOutput 中存在
- 通过 `project_script_hash` 获取 Output 中的 ContributionArgs
- Contribution 的 `capacity` 与其Data Cell中的一致

### **Contribution合并**

```
Input:
	0:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 1000
	1:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 2000
	2:
		CKB ...
Output:
	0:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 3000
	1:
		CKB ...
Deps:
	Project
```

Contribution:

- Input中必须有超过1个， Output中只有一个 （通过 GroupInput和GroupOutput来获取）
- 获取ProjectCell，交易当前Cell与 Project信息是否匹配
- Input中 `capacity` 总和必须是Output中那一个的 `capacity`
- 全部的Type Script必须正确

### 众筹成功

```
Input:
	0:
		Lock: UserDefined
		Type: Project
			Args:
				creator_lock_script_hash: Creator Script Hash
				goal_amount: 10000
	1:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 3000
	2:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 4000
	3:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 5000
Output:
	0:
		Lock: Creator Script'
		capacity: 12000+
```

Project:

- `deadline` 没有过期
- 全部 Contribution 信息一致
- 全部的 Contribution capacity 之和大于等于 `goal_amount`
- Output中的Lock 为 `creator_lock_script_hash` 且 capacity 大于等于 Contribution capacity （因为 Project销毁后，可能会有富裕的）
- Output中不存在（已被销毁）

Contribution:

- Input 中存在 Project，且信息一致
- Output中不存在其自身（已被销毁）
- 自身的TypeScript正确

### 众筹退款

```
Input:
	0:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 3000
	1:
		Lock: UserDefained
		Type: Claim
		Cell Data: 1000
Output:
	0:
		Lock: Contribution
			Args: ...
		Type: UserDefained
		capacity: 2000
	1:
		Lock: UserDefained
		capacity: 2000+
...
```

Contribution:

- `deadline` 过期
- Input中存在 Claim 且 Output 中不存在，且信息一致
- Input 与Output的capacity差值为 Claim 的 CellData 值

Claim: 

- `deadline` 过期
- Input 中必须存在 Contribution 且信息一致
- Input 与Output的capacity差值为 Claim 的 CellData 值。且Lock为 `backer_lock_script`

### 众筹失败，销毁Project

```
Input:
	0:
		Lock: UserDefained
		Type: Project
			Args:
				type_id: ...
				creator_lock_script_hash: ...
				goal_amount: 100
				dealine: ...
Output:
	0:
		ckb
```

Project:

- `deadline` 过期
- Output中不存在（销毁）

### 众筹成功，销毁 Claim

```
Input:
	0:
		Lock: UserDefained
		Type: Claim
		Cell Data: 1000
Output:
	0: CKB...
```

Claim: 

- `deadline` 过期
- Input中没有 Contribution